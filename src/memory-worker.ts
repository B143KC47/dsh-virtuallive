/** Python server entrypoint; EOF from the owning Harness requests graceful teardown. */
export const MEMORY_WORKER_SOURCE = `
import asyncio
import os
import sys
import threading
import uvicorn
from hindsight_api import MemoryEngine
from hindsight_api.api import create_app

async def run():
    memory = MemoryEngine()
    server = uvicorn.Server(uvicorn.Config(
        create_app(memory), host=os.environ['VIRTUALLIVE_MEMORY_HOST'],
        port=int(os.environ['VIRTUALLIVE_MEMORY_PORT']), log_level='warning',
        access_log=False,
    ))
    def watch_owner():
        sys.stdin.readline()
        server.should_exit = True
    threading.Thread(target=watch_owner, daemon=True).start()
    await server.serve()

asyncio.run(run())
`.trim()
