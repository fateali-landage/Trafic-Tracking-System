from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
from app.models import User
from app import db
from app.config import Config

auth_bp = Blueprint('auth', __name__)

ALLOWED_ROLES = ('citizen', 'officer')


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data:
        return jsonify({'message': 'No data provided'}), 400

    name     = (data.get('name') or '').strip()
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    role     = data.get('role', 'citizen')

    if not email or not password:
        return jsonify({'message': 'Email and password are required'}), 400

    if not name:
        return jsonify({'message': 'Name is required'}), 400

    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters'}), 400

    if role not in ALLOWED_ROLES:
        role = 'citizen'

    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'An account with that email already exists'}), 400

    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

    new_user = User(
        name=name,
        email=email,
        password_hash=hashed_password,
        role=role,
    )

    db.session.add(new_user)
    db.session.commit()

    return jsonify({'message': 'User created successfully'}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data:
        return jsonify({'message': 'No data provided'}), 400

    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'message': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'message': 'Invalid email or password'}), 401

    token = jwt.encode({
        'user_id': user.id,
        'role'   : user.role,
        'exp'    : datetime.datetime.utcnow() + datetime.timedelta(hours=24),
    }, Config.SECRET_KEY, algorithm='HS256')

    return jsonify({
        'token': token,
        'user' : {
            'id'   : user.id,
            'name' : user.name,
            'email': user.email,
            'role' : user.role,
        },
    }), 200


@auth_bp.route('/me', methods=['GET'])
def me():
    from app.middleware import token_required
    from flask import g
    token = None
    auth_header = request.headers.get('Authorization', '')
    parts = auth_header.split()
    if len(parts) == 2 and parts[0] == 'Bearer':
        token = parts[1]
    if not token:
        return jsonify({'message': 'Token missing'}), 401
    try:
        data = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
        user = User.query.get(data['user_id'])
        if not user:
            return jsonify({'message': 'User not found'}), 404
        return jsonify({'user': {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role}}), 200
    except jwt.ExpiredSignatureError:
        return jsonify({'message': 'Token has expired'}), 401
    except Exception:
        return jsonify({'message': 'Invalid token'}), 401
