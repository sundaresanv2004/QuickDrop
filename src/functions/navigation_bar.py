import flet as ft

from ..pages.explore import explore_page
from ..pages.settings import settings_page


def set_navigation_bar(page: ft.Page, main_content: ft.Column) -> ft.NavigationBar:

    def on_option(e) -> None:
        selected_index = e.data
        main_content.controls.clear()

        if selected_index == '0':
            explore_page(page, main_content)
        elif selected_index == '1':
            settings_page(page, main_content)


    return ft.NavigationBar(
        selected_index=0,
        destinations=[
            ft.NavigationBarDestination(
                icon=ft.Icons.EXPLORE_OUTLINED,
                selected_icon=ft.Icons.EXPLORE,
                label="Explore",
            ),
            ft.NavigationBarDestination(
                icon=ft.Icons.SETTINGS_OUTLINED,
                selected_icon=ft.Icons.SETTINGS,
                label="Settings",
            ),
        ],
        on_change=on_option
    )
