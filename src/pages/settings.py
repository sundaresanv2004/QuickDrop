import flet as ft
from src.functions import device_info

APP_VERSION = "0.1.0-alpha"

def settings_page(page: ft.Page, main_content: ft.Column) -> None:
    device_name_text = ft.Text(device_info.get_device_name(page))

    def save_new_name(e):
        new_name = edit_name_field.value.strip()
        if new_name:
            page.client_storage.set("device_name", new_name)
            device_name_text.value = new_name
            edit_dialog.open = False
            page.snack_bar = ft.SnackBar(ft.Text(f"Device name changed to {new_name}"), open=True)
            page.update()

    def close_dialog(e):
        edit_dialog.open = False
        page.update()

    edit_name_field = ft.TextField(
        label="New device name",
        value=device_name_text.value,
        on_submit=save_new_name,
        autofocus=True
    )

    edit_dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("Change Device Name"),
        content=edit_name_field,
        actions=[
            ft.TextButton("Cancel", on_click=close_dialog),
            ft.FilledButton("Save", on_click=save_new_name),
        ],
        actions_alignment=ft.MainAxisAlignment.END,
    )

    def open_edit_dialog(e):
        page.dialog = edit_dialog
        edit_dialog.open = True
        # Pre-fill the text field with the current name when dialog opens
        edit_name_field.value = device_name_text.value
        page.update()

    # --- Page Content ---
    content = ft.Card(
        content=ft.Container(
            content=ft.Column(
                [
                    ft.ListTile(
                        title=ft.Text("Settings", weight=ft.FontWeight.W_600),
                    ),
                    ft.Divider(height=1),
                    ft.ListTile(
                        leading=ft.Icon(ft.Icons.INFO_OUTLINE_ROUNDED),
                        title=ft.Text("App Version"),
                        subtitle=ft.Text(APP_VERSION),
                    ),
                    ft.ListTile(
                        leading=ft.Icon(ft.Icons.BADGE_OUTLINED),
                        title=ft.Text("Device Name"),
                        subtitle=device_name_text,
                        trailing=ft.IconButton(
                            icon=ft.Icons.EDIT_OUTLINED,
                            tooltip="Edit device name",
                            on_click=open_edit_dialog,
                        ),
                    ),
                ],
                spacing=0,
            ),
            padding=ft.padding.symmetric(vertical=10),
        )
    )

    main_content.controls.append(content)
