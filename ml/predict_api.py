from pathlib import Path
import pickle
import re

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "chatbot_model.pkl"


# ------------------------------------------------------------
# Load trained model
# ------------------------------------------------------------

try:
    with open(MODEL_PATH, "rb") as file:
        model_data = pickle.load(file)

    model = model_data["model"]
    label_encoder = model_data["label_encoder"]

except Exception as error:
    raise RuntimeError(
        f"Unable to load chatbot model: {error}"
    )


# ------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------

app = FastAPI(
    title="QueueKisan ML Chatbot API",
    version="1.0.0"
)


# ------------------------------------------------------------
# Request model
# ------------------------------------------------------------

class PredictionRequest(BaseModel):
    message: str


# ------------------------------------------------------------
# Language detection
# ------------------------------------------------------------

def detect_language(text: str) -> str:
    """
    Detect the language/style used by the farmer.

    Returns:
        en         -> English
        hi         -> Hindi in Devanagari
        mr         -> Marathi in Devanagari
        hi_roman   -> Hindi typed using English letters
        mr_roman   -> Marathi typed using English letters
        hinglish   -> mixed Hindi-English
    """

    text_lower = text.lower().strip()

    # --------------------------------------------------------
    # Devanagari detection
    # --------------------------------------------------------

    devanagari_chars = len(
        re.findall(r"[\u0900-\u097F]", text)
    )

    latin_chars = len(
        re.findall(r"[A-Za-z]", text)
    )

    # Hindi/Marathi written in Devanagari
    if devanagari_chars > 0:

        # Common Marathi words
        marathi_words = [
            "माझा", "माझी", "माझे", "मला", "मी",
            "माझ्या", "आहे", "आहेत", "काय", "किती",
            "कोणता", "कोणते", "कोणत्या", "शेतकरी",
            "शेतकऱ्यांना", "पिक", "पीक", "केंद्रावर",
            "करायचा", "करायची", "करायचे", "हवी",
            "हवा", "हवे", "सांगा", "दाखवा", "कुठे"
        ]

        # Common Hindi words
        hindi_words = [
            "मेरा", "मेरी", "मेरे", "मुझे", "मैं",
            "मेरे", "क्या", "कितना", "कितने", "कौन",
            "कौनसा", "कौनसी", "किस", "किसान",
            "केंद्र", "करना", "करनी", "करते", "है",
            "हैं", "बता", "बताओ", "कहाँ", "कब"
        ]

        marathi_score = sum(
            1 for word in marathi_words
            if word in text
        )

        hindi_score = sum(
            1 for word in hindi_words
            if word in text
        )

        if marathi_score > hindi_score:
            return "mr"

        if hindi_score > marathi_score:
            return "hi"

        # Default for Devanagari when uncertain
        return "mr"

    # --------------------------------------------------------
    # Roman-script language detection
    # --------------------------------------------------------

    if latin_chars > 0:

        marathi_roman_words = [
            "majha", "majhi", "majhe", "mala", "mi",
            "majhya", "aahe", "ahet", "kay", "kiti",
            "konta", "konte", "kontya", "shetkari",
            "pik", "peek", "kendr", "kendra", "kuthe",
            "sanga", "dakhva", "hava", "havi", "have",
            "karaycha", "karaychi", "karayche", "mala"
        ]

        hindi_roman_words = [
            "mera", "meri", "mere", "mujhe", "main",
            "mujhse", "kya", "kitna", "kitne", "kaun",
            "kaunsa", "kaunsi", "kis", "kisan",
            "kendra", "hai", "hain", "bata", "batao",
            "kahan", "kab", "karna", "karni", "karun"
        ]

        english_words = [
            "what", "is", "my", "the", "how", "can",
            "where", "when", "which", "tell", "show",
            "please", "check", "number", "token",
            "queue", "booking", "status", "time",
            "centre", "center", "crop", "help"
        ]

        marathi_score = sum(
            1 for word in marathi_roman_words
            if re.search(r"\b" + re.escape(word) + r"\b", text_lower)
        )

        hindi_score = sum(
            1 for word in hindi_roman_words
            if re.search(r"\b" + re.escape(word) + r"\b", text_lower)
        )

        english_score = sum(
            1 for word in english_words
            if re.search(r"\b" + re.escape(word) + r"\b", text_lower)
        )

        # Strong mixed Hindi/English
        if hindi_score > 0 and english_score > 0:
            return "hinglish"

        # Strong mixed Marathi/English
        if marathi_score > 0 and english_score > 0:
            return "mr_roman"

        if marathi_score > hindi_score and marathi_score > english_score:
            return "mr_roman"

        if hindi_score > marathi_score and hindi_score > english_score:
            return "hi_roman"

        if english_score > 0:
            return "en"

        return "en"

    return "en"

# ------------------------------------------------------------
# Prediction endpoint
# ------------------------------------------------------------

@app.post("/predict")
def predict(request: PredictionRequest):

    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message is required."
        )

    # Detect language
    language = detect_language(message)

    # Predict intent
    prediction = model.predict([message])[0]

    # Convert numeric prediction to intent
    intent = label_encoder.inverse_transform(
        [prediction]
    )[0]

    return {
        "success": True,
        "message": message,
        "intent": intent,
        "language": language
    }


# ------------------------------------------------------------
# Health check
# ------------------------------------------------------------

@app.get("/health")
def health():

    return {
        "ok": True,
        "service": "queuekisan-ml"
    }