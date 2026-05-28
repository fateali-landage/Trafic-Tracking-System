from functools import wraps
from flask import request, jsonify
import jwt
from app.config import Config
from app.models import User


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        parts = auth_header.split()
        if len(parts) == 2 and parts[0] == 'Bearer':
            token = parts[1]

        if not token:
            return jsonify({'message': 'Authentication token is missing'}), 401

        try:
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Session expired — please sign in again'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid authentication token'}), 401

        current_user = User.query.get(payload['user_id'])
        if not current_user:
            return jsonify({'message': 'User account not found'}), 401

        if 'role' in payload and current_user.role != payload['role']:
            current_user.role = payload['role']

        return f(current_user, *args, **kwargs)

    return decorated
