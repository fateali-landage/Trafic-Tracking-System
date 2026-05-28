from flask import Blueprint, request, jsonify
from app.models import Camera
from app import db
from app.middleware import token_required

cameras_bp = Blueprint('cameras', __name__)


def camera_to_dict(c):
    return {
        'id': c.id,
        'name': c.name,
        'location': c.location,
        'latitude': c.latitude,
        'longitude': c.longitude,
        'status': c.status or 'active',
        'ai_enabled': c.ai_enabled or False,
        'violations_detected': c.violations_detected or 0,
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


@cameras_bp.route('', methods=['GET'])
@token_required
def get_cameras(current_user):
    cameras = Camera.query.order_by(Camera.created_at.desc()).all()
    return jsonify({'cameras': [camera_to_dict(c) for c in cameras]}), 200


@cameras_bp.route('', methods=['POST'])
@token_required
def add_camera(current_user):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    data = request.get_json()
    if not data or not data.get('name') or not data.get('location'):
        return jsonify({'message': 'Name and location are required'}), 400

    camera = Camera(
        name=data['name'].strip(),
        location=data['location'].strip(),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        status=data.get('status', 'active'),
        ai_enabled=data.get('ai_enabled', False),
        violations_detected=0,
    )
    db.session.add(camera)
    db.session.commit()
    return jsonify({'message': 'Camera added', 'id': camera.id}), 201


@cameras_bp.route('/<int:cid>', methods=['PUT'])
@token_required
def update_camera(current_user, cid):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    camera = Camera.query.get(cid)
    if not camera:
        return jsonify({'message': 'Camera not found'}), 404

    data = request.get_json() or {}
    for field in ['name', 'location', 'latitude', 'longitude', 'status', 'ai_enabled']:
        if field in data:
            setattr(camera, field, data[field])

    db.session.commit()
    return jsonify({'message': 'Camera updated', 'camera': camera_to_dict(camera)}), 200


@cameras_bp.route('/<int:cid>', methods=['DELETE'])
@token_required
def delete_camera(current_user, cid):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    camera = Camera.query.get(cid)
    if not camera:
        return jsonify({'message': 'Camera not found'}), 404

    db.session.delete(camera)
    db.session.commit()
    return jsonify({'message': 'Camera deleted'}), 200
