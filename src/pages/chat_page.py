# src/pages/chat_page.py
import flet as ft


async def chat_page(page: ft.Page, main_content: ft.Column, target_device_info: dict):
    target_name = target_device_info['name']

    # --- UI Components ---

    # The view for all chat messages
    chat_view = ft.ListView(
        expand=True,
        spacing=10,
        auto_scroll=True,
        # Add some initial placeholder messages
        controls=[
            ft.Text("This is the beginning of your conversation."),
        ]
    )

    # The input field for typing new messages
    new_message_field = ft.TextField(
        hint_text="Write a message...",
        expand=True,
        filled=True,
        border_radius=30,
    )

    # The send button
    send_button = ft.IconButton(
        icon=ft.Icons.SEND_ROUNDED,
        tooltip="Send message",
    )

    # --- Page Layout ---

    # Hide the main navigation bar when in a chat
    page.navigation_bar.visible = False

    # Create a custom app bar for the chat page with a back button
    page.appbar = ft.AppBar(
        leading=ft.IconButton(
            icon=ft.Icons.ARROW_BACK_ROUNDED,
            on_click=lambda _: page.go('/'),  # Navigate back to the explore page
            tooltip="Back to devices"
        ),
        title=ft.Text(f"Chat with {target_name}"),
        center_title=True,
        bgcolor=ft.Colors.ON_SURFACE_VARIANT,
    )

    # Clear the main content area and build the chat UI
    main_content.controls.clear()
    main_content.controls.extend([
        chat_view,
        ft.Row(
            controls=[
                new_message_field,
                send_button,
            ]
        ),
    ])

    page.update()
