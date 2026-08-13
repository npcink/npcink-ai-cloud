from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest

from app.domain.audio_generation.artifacts import (
    AudioArtifactMaterializationConfig,
    AudioArtifactMaterializationError,
    _download_audio_url,
)

_PUBLIC_ADDRESS = "93.184.216.34"


def _public_resolver(hostname: str, port: int) -> tuple[str, ...]:
    assert hostname == "audio.provider.test"
    assert port == 443
    return (_PUBLIC_ADDRESS,)


def _config(*, max_bytes: int = 32) -> AudioArtifactMaterializationConfig:
    return AudioArtifactMaterializationConfig(
        max_bytes=max_bytes,
        timeout_seconds=2.0,
        allowed_hosts=("audio.provider.test",),
    )


def test_audio_provider_fetch_pins_public_address_and_streams_with_limit() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["host"] = request.headers["host"]
        captured["sni"] = request.extensions["sni_hostname"]
        return httpx.Response(
            200,
            headers={"content-type": "audio/mpeg"},
            content=b"ID3provider-audio",
        )

    assert _download_audio_url(
        "https://audio.provider.test/generated/audio.mp3?sig=secret",
        config=_config(),
        resolver=_public_resolver,
        transport=httpx.MockTransport(handler),
    ) == b"ID3provider-audio"
    assert captured == {
        "url": f"https://{_PUBLIC_ADDRESS}/generated/audio.mp3?sig=secret",
        "host": "audio.provider.test",
        "sni": "audio.provider.test",
    }


def test_audio_provider_fetch_tries_each_validated_public_address() -> None:
    first_address = "2001:4860:4860::8888"
    attempted_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempted_urls.append(str(request.url))
        if request.url.host == first_address:
            raise httpx.ConnectError("IPv6 route unavailable", request=request)
        return httpx.Response(
            200,
            headers={"content-type": "audio/mpeg"},
            content=b"ID3provider-audio",
        )

    assert _download_audio_url(
        "https://audio.provider.test/audio.mp3",
        config=_config(),
        resolver=lambda hostname, port: (first_address, _PUBLIC_ADDRESS),
        transport=httpx.MockTransport(handler),
    ) == b"ID3provider-audio"
    assert attempted_urls == [
        f"https://[{first_address}]/audio.mp3",
        f"https://{_PUBLIC_ADDRESS}/audio.mp3",
    ]


@pytest.mark.parametrize(
    ("source_url", "addresses", "expected_message"),
    [
        (
            "http://audio.provider.test/audio.mp3",
            (_PUBLIC_ADDRESS,),
            "provider audio URL must use HTTPS",
        ),
        (
            "https://unapproved.provider.test/audio.mp3",
            (_PUBLIC_ADDRESS,),
            "provider audio host is not allowlisted",
        ),
        (
            "https://audio.provider.test/audio.mp3",
            ("169.254.169.254",),
            "provider audio host is not publicly routable",
        ),
    ],
)
def test_audio_provider_fetch_rejects_unsafe_targets(
    source_url: str,
    addresses: tuple[str, ...],
    expected_message: str,
) -> None:
    with pytest.raises(AudioArtifactMaterializationError) as error:
        _download_audio_url(
            source_url,
            config=_config(),
            resolver=lambda hostname, port: addresses,
            transport=httpx.MockTransport(lambda request: httpx.Response(200)),
        )
    assert error.value.message == expected_message


def test_audio_provider_fetch_rejects_redirects_and_oversize_streams() -> None:
    with pytest.raises(AudioArtifactMaterializationError) as redirect_error:
        _download_audio_url(
            "https://audio.provider.test/audio.mp3",
            config=_config(),
            resolver=_public_resolver,
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    302,
                    headers={"location": "https://audio.provider.test/other.mp3"},
                )
            ),
        )
    assert redirect_error.value.message == "provider audio URL redirects are forbidden"

    class ChunkedAudio(httpx.SyncByteStream):
        def __iter__(self) -> Iterator[bytes]:
            yield b"1234"
            yield b"5678"

    with pytest.raises(AudioArtifactMaterializationError) as size_error:
        _download_audio_url(
            "https://audio.provider.test/audio.mp3",
            config=_config(max_bytes=7),
            resolver=_public_resolver,
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    headers={"content-type": "audio/mpeg"},
                    stream=ChunkedAudio(),
                )
            ),
        )
    assert size_error.value.message == "provider audio payload exceeded size limit"


def test_audio_provider_fetch_fails_closed_without_allowlist() -> None:
    with pytest.raises(AudioArtifactMaterializationError) as error:
        _download_audio_url(
            "https://audio.provider.test/audio.mp3",
            config=AudioArtifactMaterializationConfig(),
            resolver=_public_resolver,
            transport=httpx.MockTransport(lambda request: httpx.Response(200)),
        )

    assert error.value.message == "provider audio host is not allowlisted"
