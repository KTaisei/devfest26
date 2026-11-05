"""Firebase initialization: cloud uses ADC; guarded local emulators use anonymous credentials."""

import os
import firebase_admin
from firebase_admin import credentials
from google.auth.credentials import AnonymousCredentials
from .config import settings


class EmulatorCredential(credentials.Base):
    def get_credential(self):
        return AnonymousCredentials()


def initialize_firebase():
    config = settings()
    if not config.firebase_project_id:
        return
    if config.firebase_emulator_mode:
        # Settings validation prevents unsigned emulator tokens being accepted in cloud mode.
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = config.firebase_auth_emulator_host
        os.environ["FIRESTORE_EMULATOR_HOST"] = config.firestore_emulator_host
    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            credential=EmulatorCredential() if config.firebase_emulator_mode else None,
            options={"projectId": config.firebase_project_id},
        )
