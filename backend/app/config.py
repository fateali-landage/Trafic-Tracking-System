import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Security — must be set in environment; falls back to a generated value in dev
    SECRET_KEY = os.getenv('SECRET_KEY') or os.urandom(32).hex()

    # Database
    SQLALCHEMY_DATABASE_URI  = os.getenv('DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping'    : True,
        'pool_recycle'     : 300,
        'connect_args'     : {'connect_timeout': 10},
    }

    # File uploads
    UPLOAD_FOLDER     = os.getenv('UPLOAD_FOLDER', 'uploads/')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024   # 16 MB

    # Optional integrations
    RAZORPAY_KEY_ID    = os.getenv('RAZORPAY_KEY_ID')
    RAZORPAY_KEY_SECRET= os.getenv('RAZORPAY_KEY_SECRET')
    GOOGLE_MAPS_API_KEY= os.getenv('GOOGLE_MAPS_API_KEY')
    FIREBASE_API_KEY   = os.getenv('FIREBASE_API_KEY')
    FIREBASE_PROJECT_ID= os.getenv('FIREBASE_PROJECT_ID')
