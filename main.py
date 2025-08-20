import flet as ft

from src.functions import theme, navigation_bar
from src.pages.explore import explore_page


def main(page: ft.Page):
    page.title = "Quick Drop"
    page.window.center()
    page.window.maximized = True

    theme.set_theme(page)

    main_content = ft.Column(
        scroll=ft.ScrollMode.ADAPTIVE,
        expand=True
    )

    page.navigation_bar = navigation_bar.set_navigation_bar(page, main_content)

    page.add(
        ft.SafeArea(
            main_content,
            expand=True,
        )
    )

    explore_page(page, main_content)


if __name__ == "__main__":
    ft.app(
        target=main,
        assets_dir="src/assets"
    )