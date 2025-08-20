import flet as ft


def set_theme(page: ft.Page) -> None:
    page.theme_mode = ft.ThemeMode.DARK
    page.theme = ft.Theme(color_scheme_seed='indigo')
    page.update()
