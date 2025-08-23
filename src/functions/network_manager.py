import flet as ft
import asyncio
import socket
import json
from zeroconf import ServiceBrowser, Zeroconf, ServiceInfo
from typing import Dict, Callable
from functools import partial
from aiohttp import web

SERVICE_TYPE = "_quickdrop._tcp.local."
SERVER_PORT = 8585

class NetworkManager:
    def __init__(self, page: ft.Page):
        self.page = page
        self.ui_update_callback: Callable | None = None
        self.message_handler_callback: Callable | None = None
        self.zeroconf = Zeroconf()
        self.discovered_devices: Dict[str, ServiceInfo] = {}
        self.device_name = ""
        self._is_running = False
        self.browser = None
        self.my_service_name = None
        self.runner = None

    def _get_local_ip(self) -> str:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

    def is_running(self) -> bool:
        return self._is_running

    async def _websocket_handler(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        print("WebSocket connection opened on server.")

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                print(f"Server received raw message: {msg.data}")
                if self.message_handler_callback:
                    await self.message_handler_callback(json.loads(msg.data), ws)
            elif msg.type == web.WSMsgType.ERROR:
                print(f'Server WebSocket connection closed with exception {ws.exception()}')

        print('Server WebSocket connection closed.')
        return ws

    async def start_server_async(self):
        app = web.Application()
        app.router.add_get('/ws', self._websocket_handler)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, '0.0.0.0', SERVER_PORT)
        await site.start()
        print(f"Started WebSocket server on port {SERVER_PORT}")

    class ZeroconfListener:
        def __init__(self, manager_instance):
            self.manager = manager_instance

        def remove_service(self, zeroconf, type, name):
            print(f"Device left: {name}")
            if name in self.manager.discovered_devices and self.manager.ui_update_callback:
                del self.manager.discovered_devices[name]
                self.manager.ui_update_callback(self.manager.discovered_devices)

        def add_service(self, zeroconf, type, name):
            info = zeroconf.get_service_info(type, name)
            if info and self.manager.ui_update_callback:
                print(f"Device found: {name}, info: {info}")
                self.manager.discovered_devices[name] = info
                self.manager.ui_update_callback(self.manager.discovered_devices)

        def update_service(self, zeroconf, type, name):
            self.add_service(zeroconf, type, name)

    async def start_discovery_async(self):
        from ..functions import device_info
        self.device_name = await device_info.get_device_name(self.page)
        self.my_service_name = f"{self.device_name}.{SERVICE_TYPE}"
        local_ip = self._get_local_ip()
        service_info = ServiceInfo(
            SERVICE_TYPE,
            name=self.my_service_name,
            addresses=[socket.inet_aton(local_ip)],
            port=SERVER_PORT,
            properties={'device_name': self.device_name, 'os': self.page.platform}
        )
        loop = asyncio.get_running_loop()
        register_task = partial(
            self.zeroconf.register_service,
            service_info,
            allow_name_change=True
        )
        await loop.run_in_executor(None, register_task)
        self._is_running = True
        print(f"Registered service for {self.device_name}")
        self.browser = ServiceBrowser(self.zeroconf, SERVICE_TYPE, self.ZeroconfListener(self))
        print("Started browsing for other QuickDrop devices...")

    async def stop_async(self):
        if self.runner:
            await self.runner.cleanup()
            print("WebSocket server has been shut down.")

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.zeroconf.unregister_all_services)
        await loop.run_in_executor(None, self.zeroconf.close)
        self._is_running = False
        