"""Ordered Android JSONL worker; Portal credentials remain inside this process."""

import argparse
import asyncio
import base64
import contextlib
import io
import json
import logging
import os
import struct
import sys
import time
from urllib.parse import urlparse

with contextlib.redirect_stdout(sys.stderr):
    import httpx
    from mobilerun_core_local.driver.android.adb import AndroidDriver
    from PIL import Image


APPS = {
    "qq": ("com.tencent.mobileqq", "https://im.qq.com/"),
    "wechat": ("com.tencent.mm", "https://weixin.qq.com/"),
    "bilibili": ("tv.danmaku.bili", "https://m.bilibili.com/"),
    "rednote": ("com.xingin.xhs", "https://www.xiaohongshu.com/"),
    "x": ("com.twitter.android", "https://x.com/"),
    "youtube": ("com.google.android.youtube", "https://m.youtube.com/"),
}


def validate_action(value, maximum_text):
    """Reject unknown fields and invalid coordinates before any input is sent."""
    if not isinstance(value, dict):
        raise ValueError("invalid-action")
    kind = value.get("kind")
    fields = {
        "observe": {"kind"},
        "tap": {"kind", "x", "y"},
        "swipe": {"kind", "x1", "y1", "x2", "y2", "durationMs"},
        "type": {"kind", "text", "clear"},
        "button": {"kind", "button"},
        "open": {"kind", "app"},
        "url": {"kind", "url"},
    }
    if kind not in fields or set(value) != fields[kind]:
        raise ValueError("invalid-action")
    coordinates = {"tap": ("x", "y"), "swipe": ("x1", "y1", "x2", "y2")}
    if kind in coordinates:
        for key in coordinates[kind]:
            if type(value[key]) is not int or not 0 <= value[key] <= 32767:
                raise ValueError("invalid-coordinate")
    if kind == "swipe" and (type(value["durationMs"]) is not int or not 100 <= value["durationMs"] <= 3000):
        raise ValueError("invalid-duration")
    if kind == "type" and (not isinstance(value["text"], str) or len(value["text"]) > maximum_text or type(value["clear"]) is not bool):
        raise ValueError("invalid-text")
    if kind == "button" and value["button"] not in ("back", "home", "enter"):
        raise ValueError("invalid-button")
    if kind == "open" and value["app"] not in APPS:
        raise ValueError("invalid-app")
    if kind == "url":
        address = value["url"]
        if not isinstance(address, str) or len(address) > 8192:
            raise ValueError("invalid-url")
        parsed = urlparse(address)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("invalid-url")
    return value


class PhoneWorker:
    """One configured Android device; mutations and capture are strictly sequential."""

    def __init__(self, config):
        self.config = config
        self.driver = AndroidDriver(serial=config["serial"], use_tcp=True, portal_mode="required")
        self.packages = None
        self.dimensions = None
        self.portal_http = None

    async def connect(self):
        await self.driver.connect()
        if self.driver.portal is None or not self.driver.portal.tcp_available:
            raise ConnectionError("Portal TCP is required")
        # Portal 0.7 uses a new HTTP client for each call; this owned connection keeps Android capture interactive.
        self.portal_http = httpx.AsyncClient(
            base_url=self.driver.portal.tcp_base_url, headers=self.driver.portal._tcp_headers,
            timeout=self.config["timeoutMs"] / 1000, trust_env=False,
            limits=httpx.Limits(max_keepalive_connections=0),
        )

    async def portal_request(self, method, path, **kwargs):
        response = await self.portal_http.request(method, path, **kwargs)
        response.raise_for_status()
        value = response.json()
        if isinstance(value, dict) and value.get("status") == "error":
            raise RuntimeError("portal-refused")
        if isinstance(value, dict) and ("result" in value or "data" in value):
            value = value["result"] if "result" in value else value["data"]
        return value

    async def observe(self):
        if self.packages is None:
            self.packages = set(await self.driver.list_packages(include_system=True))
        image, state = await asyncio.gather(self.capture(), self.portal_request("GET", "/state_full"))
        if isinstance(state, str):
            state = json.loads(state)
        with image:
            device_width, device_height = image.size
            self.dimensions = image.size
            width = min(device_width, self.config["screenshotWidth"])
            height = round(device_height * width / device_width)
            image = image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=self.config["screenshotQuality"])
        tree = json.dumps(compact_state(state), ensure_ascii=False, separators=(",", ":"))
        maximum = self.config["maxTreeCharacters"]
        return {
            "screen": {
                "mediaType": "image/jpeg", "data": base64.b64encode(output.getvalue()).decode("ascii"),
                "width": width, "height": height, "deviceWidth": device_width, "deviceHeight": device_height,
            },
            "tree": tree[:maximum], "treeTruncated": len(tree) > maximum,
            "apps": [{"id": app, "installed": package in self.packages, "login": "unknown"} for app, (package, _) in APPS.items()],
            "observedAt": round(time.time() * 1000),
        }

    async def capture(self):
        if self.config["capture"] == "portal":
            encoded = await self.portal_request("GET", "/screenshot")
            return Image.open(io.BytesIO(base64.b64decode(encoded, validate=True)))
        connection = await self.driver.device.shell("screencap", stream=True, timeout=self.config["timeoutMs"] / 1000)
        async with connection:
            width, height, pixel_format, _dataspace = struct.unpack("<IIII", await connection.read(16))
            modes = {1: ("RGBA", 4), 2: ("RGBX", 4), 3: ("RGB", 3), 5: ("BGRA", 4)}
            if pixel_format not in modes or not 0 < width <= 32768 or not 0 < height <= 32768:
                raise ValueError("unsupported-raw-display")
            mode, channels = modes[pixel_format]
            byte_count = width * height * channels
            if byte_count > self.config["maxResponseBytes"]:
                raise ValueError("raw-display-limit")
            pixels = await connection.read(byte_count)
        return Image.frombytes("RGB" if channels == 3 else "RGBA", (width, height), pixels, "raw", mode)

    def check_point(self, x, y):
        if self.dimensions is None or x >= self.dimensions[0] or y >= self.dimensions[1]:
            raise ValueError("coordinate-outside-display")

    async def action(self, action):
        kind = action["kind"]
        if kind == "observe":
            self.packages = None
        elif kind == "tap":
            self.check_point(action["x"], action["y"])
            await self.driver.tap(action["x"], action["y"])
        elif kind == "swipe":
            self.check_point(action["x1"], action["y1"])
            self.check_point(action["x2"], action["y2"])
            await self.driver.swipe(action["x1"], action["y1"], action["x2"], action["y2"], action["durationMs"])
        elif kind == "type":
            await self.portal_request("POST", "/keyboard/input", json={
                "base64_text": base64.b64encode(action["text"].encode("utf-8")).decode("ascii"), "clear": action["clear"],
            })
        elif kind == "button":
            await self.driver.press_button(action["button"])
        elif kind == "open":
            package, website = APPS[action["app"]]
            if self.packages is None:
                self.packages = set(await self.driver.list_packages(include_system=True))
            if package in self.packages:
                await self.driver.start_app(package)
            else:
                await self.open_url(website)
        elif kind == "url":
            await self.open_url(action["url"])
        return await self.observe()

    async def open_url(self, address):
        result = await self.driver.device.shell2(["am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", address])
        if result.returncode != 0 or any(line.startswith(("Error", "Exception", "Security exception")) for line in result.output.splitlines()):
            raise RuntimeError("url-open-not-confirmed")

    async def close(self):
        if self.portal_http is not None:
            await self.portal_http.aclose()


def compact_state(state):
    """Retain visible labels, interaction properties, and Android pixel bounds."""
    if not isinstance(state, dict):
        raise ValueError("invalid-state")
    nodes = []

    def visit(node):
        if not isinstance(node, dict):
            return
        keys = ("packageName", "resourceId", "className", "text", "contentDescription", "hint", "boundsInScreen")
        item = {key: node[key] for key in keys if node.get(key)}
        for key in ("isClickable", "isEditable", "isScrollable", "isFocused", "isPassword"):
            if node.get(key):
                item[key] = True
        if node.get("isEnabled") is False:
            item["isEnabled"] = False
        if item:
            nodes.append(item)
        for child in node.get("children", []):
            visit(child)

    visit(state.get("a11y_tree", {}))
    return {"phone_state": state.get("phone_state", {}), "nodes": nodes}


async def run(config):
    logging.basicConfig(stream=sys.stderr, level=logging.ERROR)
    worker = PhoneWorker(config)
    connected = False
    maximum = config["maxRequestBytes"]
    while True:
        line = await asyncio.to_thread(sys.stdin.buffer.readline, maximum + 1)
        if not line:
            await worker.close()
            return
        if len(line) > maximum or not line.endswith(b"\n"):
            return
        request_id = None
        started = time.perf_counter()
        dispatched = False
        try:
            request = json.loads(line)
            if not isinstance(request, dict) or set(request) != {"id", "action"} or type(request["id"]) is not int or request["id"] < 1:
                raise ValueError("invalid-request")
            request_id = request["id"]
            action = validate_action(request["action"], config["maxTextCharacters"])
            if not connected:
                await worker.connect()
                connected = True
            if action["kind"] != "observe" and worker.dimensions is None:
                await worker.observe()
            dispatched = action["kind"] != "observe"
            result = await worker.action(action)
            result["elapsedMs"] = round((time.perf_counter() - started) * 1000)
            response = {"id": request_id, "result": result}
        except Exception as error:
            # Library exception messages can contain authentication or entered text.
            logging.error("Android operation failed (%s)", type(error).__name__)
            response = {"id": request_id, "error": {"code": "unavailable", "uncertain": dispatched}}
        encoded = json.dumps(response, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        if len(encoded) > config["maxResponseBytes"]:
            encoded = json.dumps({"id": request_id, "error": {"code": "protocol", "uncertain": dispatched}}).encode("ascii") + b"\n"
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    options = parser.parse_args()
    settings = json.loads(options.config)
    os.environ["ADBUTILS_ADB_PATH"] = settings["adb"]
    asyncio.run(run(settings))
