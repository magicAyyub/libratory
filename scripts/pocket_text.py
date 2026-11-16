import re


_HORIZONTAL_SPACE = r"[ \t\u00a0\u202f]"


def synthesis_text_for(text: str, language: str) -> str:
    if language != "french_24l":
        return text

    text = text.replace("\u2019", "'")
    text = re.sub(r"«" + _HORIZONTAL_SPACE + "*", "", text)
    text = re.sub(_HORIZONTAL_SPACE + "*»", "", text)
    text = re.sub(r"(?<=\d)" + _HORIZONTAL_SPACE + "*/" + _HORIZONTAL_SPACE + r"*(?=\d)", " ", text)
    text = re.sub(r"(?<!\d)" + _HORIZONTAL_SPACE + "*:" + _HORIZONTAL_SPACE + r"*(?!\d)", ", ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"+[-–—]" + _HORIZONTAL_SPACE + "+", ", ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"{2,}", " ", text)
    text = re.sub(_HORIZONTAL_SPACE + r"+([,.;!?])", r"\1", text)
    return text
