# src/pages/chat_page.py (Updated for Live Chat)
import flet as ft
import asyncio
import json
from aiohttp import WSMsgType


class ChatSession:
    """Manages a single chat session's WebSocket connection and UI updates."""

    def __init__(self, page: ft.Page, chat_view: ft.ListView, new_message_field: ft.TextField):
        self.page = page
        self.chat_view = chat_view
        self.new_message_field = new_message_field
        self.ws = self.page.session.get("active_ws_connection")
        self.network_manager = self.page.session.get("network_manager")

    async def listen_for_messages(self):
        """Starts a background task to listen for incoming messages."""
        if not self.ws:
            print("No active WebSocket connection found for listening.")
            return

        # Set the callback in NetworkManager to route direct messages here
        self.network_manager.message_handler_callback = self.on_message_received

        print("Now listening for chat messages...")
        # For the requester, we also need to listen on the existing connection
        try:
            async for msg in self.ws:
                if msg.type == WSMsgType.TEXT:
                    await self.on_message_received(json.loads(msg.data), self.ws)
                elif msg.type == WSMsgType.CLOSED or msg.type == WSMsgType.ERROR:
                    break
        except Exception as e:
            print(f"Error in client listener: {e}")

    async def on_message_received(self, data: dict, ws):
        """Callback for when a message comes from the server or client listener."""
        message_type = data.get("type")
        if message_type == "chat_message":
            from_device = data.get("from_device", "Them")
            message_text = data.get("text", "")
            self.chat_view.controls.append(ft.Text(f"{from_device}: {message_text}"))
            self.page.update()

    async def send_message_click(self, e):
        """Handles the send button click event."""
        if not self.new_message_field.value or not self.ws:
            return

        message_text = self.new_message_field.value
        my_device_name = self.network_manager.device_name

        message_payload = {
            "type": "chat_message",
            "from_device": my_device_name,
            "text": message_text
        }

        try:
            await self.ws.send_str(json.dumps(message_payload))
            self.chat_view.controls.append(ft.Text(f"You: {message_text}", text_align=ft.TextAlign.RIGHT))
            self.new_message_field.value = ""
            self.page.update()
        except Exception as ex:
            print(f"Failed to send message: {ex}")

    async def disconnect(self):
        """Cleans up the connection and resources."""
        print("Disconnecting chat session...")
        # Reset the global message handler
        if self.page.session.get("main_message_handler"):
            self.network_manager.message_handler_callback = self.page.session.get("main_message_handler")

        # Close client-side session if it exists
        aiohttp_session = self.page.session.get("aiohttp_session")
        if aiohttp_session and not aiohttp_session.closed:
            await aiohttp_session.close()

        # The server manages its side of the connection automatically when closed
        self.page.session.remove("active_ws_connection")
        self.page.session.remove("aiohttp_session")


async def chat_page(page: ft.Page, main_content: ft.Column, target_device_info: dict):
    target_name = target_device_info['name']

    chat_view = ft.ListView(expand=True, spacing=10, auto_scroll=True)
    new_message_field = ft.TextField(hint_text="Write a message...", expand=True, filled=True, border_radius=30)

    # Create and setup the session manager
    session = ChatSession(page, chat_view, new_message_field)
    new_message_field.on_submit = session.send_message_click

    send_button = ft.IconButton(
        icon=ft.Icons.SEND_ROUNDED,
        tooltip="Send message",
        on_click=session.send_message_click
    )

    asyncio.create_task(session.listen_for_messages())

    async def go_back(e):
        await session.disconnect()
        page.go('/')

    page.navigation_bar.visible = False
    page.appbar = ft.AppBar(
        leading=ft.IconButton(icon=ft.Icons.ARROW_BACK_ROUNDED, on_click=go_back, tooltip="Back to devices"),
        title=ft.Text(f"Chat with {target_name}"),
        center_title=True,
        bgcolor=ft.Colors.ON_PRIMARY,
    )

    main_content.controls.clear()
    main_content.controls.extend([
        chat_view,
        ft.Row(controls=[new_message_field, send_button]),
    ])

    page.update()
