import flet as ft
from ..functions import device_info
from ..functions.alert_dialog import edit_device_name_dialog
from ..functions.theme import update_theme

APP_VERSION = "0.1.0-alpha"


async def settings_page(page: ft.Page, main_content: ft.Column) -> None:
    def get_directory_result(e: ft.FilePickerResultEvent):
        if e.path:
            page.client_storage.set("download_path", e.path)
            download_path_text.value = e.path
            page.snack_bar = ft.SnackBar(ft.Text(f"Download location set to: {e.path}"), open=True)
            page.update()

    directory_picker = ft.FilePicker(on_result=get_directory_result)
    page.overlay.append(directory_picker)

    device_name_text = ft.Text(await device_info.get_device_name(page))
    download_path_value = await page.client_storage.get_async("download_path")
    download_path_text = ft.Text(
        value=download_path_value or "Default (Downloads Folder)",
        italic=not download_path_value
    )

    def on_name_saved(new_name: str):
        device_name_text.value = new_name

    content_cards = [
        ft.Card(
            content=ft.Container(
                content=ft.Column(
                    [
                        ft.ListTile(title=ft.Text("General", weight=ft.FontWeight.BOLD)),
                        ft.Divider(height=1),
                        ft.ListTile(
                            leading=ft.Icon(ft.Icons.BADGE_OUTLINED),
                            title=ft.Text("Device Name"),
                            subtitle=device_name_text,
                            trailing=ft.IconButton(
                                icon=ft.Icons.EDIT_OUTLINED,
                                on_click=lambda _: edit_device_name_dialog(page, device_name_text.value, on_name_saved)),
                        ),
                        ft.ListTile(
                            leading=ft.Icon(ft.Icons.DARK_MODE_OUTLINED),
                            title=ft.Text("Dark Mode"),
                            trailing=ft.Switch(value=page.theme_mode == ft.ThemeMode.DARK,
                                               on_change=lambda e: update_theme(e, page)),
                        ),
                    ], spacing=0
                ), padding=ft.padding.symmetric(vertical=10)
            )
        ),
        ft.Card(
            content=ft.Container(
                content=ft.Column(
                    [
                        ft.ListTile(title=ft.Text("Transfers", weight=ft.FontWeight.BOLD)),
                        ft.Divider(height=1),
                        ft.ListTile(
                            leading=ft.Icon(ft.Icons.FOLDER_OPEN_OUTLINED),
                            title=ft.Text("Download Location"),
                            subtitle=download_path_text,
                            on_click=lambda _: directory_picker.get_directory_path(),
                        ),
                        ft.ListTile(
                            leading=ft.Icon(ft.Icons.SHIELD_OUTLINED),
                            title=ft.Text("Ask Before Receiving"),
                            subtitle=ft.Text("Prompt before accepting files from others."),
                            trailing=ft.Switch(value=True),
                        ),
                    ], spacing=0
                ), padding=ft.padding.symmetric(vertical=10)
            )
        ),
        ft.Card(
            content=ft.Container(
                content=ft.Column(
                    [
                        ft.ListTile(title=ft.Text("About", weight=ft.FontWeight.BOLD)),
                        ft.Divider(height=1),
                        ft.ListTile(
                            leading=ft.Icon(ft.Icons.INFO_OUTLINE_ROUNDED),
                            title=ft.Text("App Version"),
                            subtitle=ft.Text(APP_VERSION),
                        ),
                        ft.ListTile(
                            leading=ft.Icon(ft.Icons.FEEDBACK_OUTLINED),
                            title=ft.Text("Send Feedback"),
                            on_click=lambda _: page.launch_url(
                                "mailto:youremail@example.com?subject=QuickDrop Feedback"),
                        ),
                    ], spacing=0
                ), padding=ft.padding.symmetric(vertical=10)
            )
        ),
    ]

    main_content.controls.clear()
    main_content.controls.extend(content_cards)
    page.update()
