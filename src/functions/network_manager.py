import flet as ft
import asyncio
import socket
from zeroconf import ServiceBrowser, Zeroconf, ServiceInfo
from typing import Dict, Callable
from functools import partial


SERVICE_TYPE = "_quickdrop._tcp.local."
SERVER_PORT = 8585


class NetworkManager:
    def __init__(self, page: ft.Page, ui_update_callback: Callable):
        self.browser = None
        self.page = page
        self.ui_update_callback = ui_update_callback
        self.zeroconf = Zeroconf()
        self.discovered_devices: Dict[str, ServiceInfo] = {}
        self.device_name = ""

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

    class ZeroconfListener:
        def __init__(self, manager_instance):
            self.manager = manager_instance

        def remove_service(self, zeroconf, type, name):
            print(f"Device left: {name}")
            if name in self.manager.discovered_devices:
                del self.manager.discovered_devices[name]
                self.manager.ui_update_callback(self.manager.discovered_devices)

        def add_service(self, zeroconf, type, name):
            info = zeroconf.get_service_info(type, name)
            if info:
                print(f"Device found: {name}, info: {info}")
                self.manager.discovered_devices[name] = info
                self.manager.ui_update_callback(self.manager.discovered_devices)

        def update_service(self, zeroconf, type, name):
            self.add_service(zeroconf, type, name)

    async def start_discovery_async(self):
        """Starts advertising this device and browsing for others."""
        from ..functions import device_info
        self.device_name = await device_info.get_device_name(self.page)

        local_ip = self._get_local_ip()
        service_info = ServiceInfo(
            SERVICE_TYPE,
            name=f"{self.device_name}.{SERVICE_TYPE}",
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

        print(f"Registered service for {self.device_name} at {self.page.platform}:{SERVER_PORT}")

        self.browser = ServiceBrowser(self.zeroconf, SERVICE_TYPE, self.ZeroconfListener(self))
        print("Started browsing for other QuickDrop devices...")

    async def stop_async(self):
        """Cleans up network services when the app closes."""
        print("Stopping network services...")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.zeroconf.unregister_all_services)
        await loop.run_in_executor(None, self.zeroconf.close)
