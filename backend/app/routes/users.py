from flask import Blueprint, request, jsonify
from app.models import User, Violation
from app import db
from app.middleware import token_required

users_bp = Blueprint('users', __name__)


@users_bp.route('', methods=['GET'])
@token_required
def get_users(current_user):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    users = User.query.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        vcnt = Violation.query.filter_by(reported_by=u.id).count()
        result.append({
            'id': u.id,
            'name': u.name,
            'email': u.email,
            'role': u.role,
            'violations_reported': vcnt,
            'created_at': u.created_at.isoformat() if u.created_at else None,
        })
    return jsonify({'users': result}), 200


@users_bp.route('/<int:uid>/role', methods=['PUT'])
@token_required
def update_role(current_user, uid):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    if uid == current_user.id:
        return jsonify({'message': 'Cannot change your own role'}), 400

    user = User.query.get(uid)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    data = request.get_json() or {}
    new_role = data.get('role', '').strip()
    if new_role not in ('admin', 'officer', 'citizen'):
        return jsonify({'message': 'Invalid role. Must be admin, officer, or citizen'}), 400

    user.role = new_role
    db.session.commit()
    return jsonify({'message': f'Role updated to {new_role}'}), 200
