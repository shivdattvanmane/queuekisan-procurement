import csv
import pickle
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "dataset.csv"
MODEL_PATH = BASE_DIR / "chatbot_model.pkl"


def load_dataset():
    texts = []
    intents = []
    languages = []

    with open(DATASET_PATH, "r", encoding="utf-8") as file:
        reader = csv.DictReader(file)

        for row in reader:
            text = row["text"].strip()
            intent = row["intent"].strip()
            language = row["language"].strip()

            if text and intent:
                texts.append(text)
                intents.append(intent)
                languages.append(language)

    return texts, intents, languages


def train():
    texts, intents, languages = load_dataset()

    if len(texts) < 10:
        raise ValueError("Training dataset is too small.")

    # Convert intent names to numbers
    label_encoder = LabelEncoder()
    intent_labels = label_encoder.fit_transform(intents)

    # TF-IDF + Logistic Regression
    model = Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                lowercase=True,
                ngram_range=(1, 2),
                sublinear_tf=True
            )
        ),
        (
            "classifier",
            LogisticRegression(
                max_iter=1000
            )
        )
    ])

    model.fit(texts, intent_labels)

    # Save model and metadata
    model_data = {
        "model": model,
        "label_encoder": label_encoder,
        "languages": sorted(set(languages))
    }

    with open(MODEL_PATH, "wb") as file:
        pickle.dump(model_data, file)

    print("Model trained successfully.")
    print(f"Training samples: {len(texts)}")
    print(f"Intents: {len(label_encoder.classes_)}")
    print(f"Model saved to: {MODEL_PATH}")


if __name__ == "__main__":
    train()