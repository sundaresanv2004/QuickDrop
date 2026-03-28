from fastapi import APIRouter, Query, HTTPException
import httpx
from bs4 import BeautifulSoup
from typing import Optional
from pydantic import BaseModel

router = APIRouter()

class LinkPreview(BaseModel):
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None

@router.get("/link-preview", response_model=LinkPreview)
async def get_link_preview(url: str = Query(..., description="The URL to fetch metadata for")):
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
            response = await client.get(url, headers=headers)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            
            # Extract Title
            title = None
            og_title = soup.find("meta", property="og:title")
            if og_title:
                title = og_title.get("content")
            if not title:
                title_tag = soup.find("title")
                if title_tag:
                    title = title_tag.string

            # Extract Description
            description = None
            og_description = soup.find("meta", property="og:description")
            if og_description:
                description = og_description.get("content")
            if not description:
                desc_tag = soup.find("meta", attrs={"name": "description"})
                if desc_tag:
                    description = desc_tag.get("content")

            # Extract Image
            image = None
            og_image = soup.find("meta", property="og:image")
            if og_image:
                image = og_image.get("content")
                # Fix relative URLs
                if image and image.startswith("/"):
                    from urllib.parse import urljoin
                    image = urljoin(url, image)

            return LinkPreview(
                url=url,
                title=title[:200] if title else None,
                description=description[:500] if description else None,
                image=image
            )

    except Exception as e:
        # Fallback for failed fetches
        return LinkPreview(url=url)
