from flask import Blueprint, request, jsonify
from app.models import Violation, Camera
from app import db
from app.middleware import token_required
from datetime import datetime

traffic_bp = Blueprint('traffic', __name__)


def violation_to_dict(v):
    return {
        'id': v.id,
        'vehicle_number': v.vehicle_number,
        'violation_type': v.violation_type,
        'description': v.description or '',
        'fine_amount': float(v.fine_amount) if v.fine_amount is not None else 0.0,
        'status': v.status or 'pending',
        'location': v.location or '',
        'reported_by': v.reported_by,
        'paid_at': v.paid_at.isoformat() if v.paid_at else None,
        'created_at': v.created_at.isoformat() if v.created_at else None,
    }


@traffic_bp.route('/violations', methods=['GET'])
@token_required
def get_violations(current_user):
    if current_user.role == 'citizen':
        violations = Violation.query.filter_by(reported_by=current_user.id).order_by(
            Violation.created_at.desc()).all()
    else:
        violations = Violation.query.order_by(Violation.created_at.desc()).all()

    return jsonify({'violations': [violation_to_dict(v) for v in violations]}), 200


@traffic_bp.route('/violations/<int:vid>', methods=['GET'])
@token_required
def get_violation(current_user, vid):
    v = Violation.query.get(vid)
    if not v:
        return jsonify({'message': 'Violation not found'}), 404
    if current_user.role == 'citizen' and v.reported_by != current_user.id:
        return jsonify({'message': 'Unauthorized'}), 403
    return jsonify({'violation': violation_to_dict(v)}), 200


@traffic_bp.route('/violations', methods=['POST'])
@token_required
def create_violation(current_user):
    if current_user.role == 'citizen':
        return jsonify({'message': 'Unauthorized'}), 403

    data = request.get_json()
    if not data or not data.get('vehicle_number') or not data.get('violation_type') or not data.get('fine_amount'):
        return jsonify({'message': 'Missing required fields'}), 400

    new_violation = Violation(
        vehicle_number=data['vehicle_number'].strip().upper(),
        violation_type=data['violation_type'],
        description=data.get('description', ''),
        fine_amount=data['fine_amount'],
        location=data.get('location', ''),
        reported_by=current_user.id,
    )

    if data.get('camera_id'):
        camera = Camera.query.get(data['camera_id'])
        if camera:
            camera.violations_detected = (camera.violations_detected or 0) + 1

    db.session.add(new_violation)
    db.session.commit()

    return jsonify({'message': 'Violation created successfully', 'id': new_violation.id}), 201


@traffic_bp.route('/violations/<int:vid>/pay', methods=['POST'])
@token_required
def pay_violation(current_user, vid):
    v = Violation.query.get(vid)
    if not v:
        return jsonify({'message': 'Violation not found'}), 404

    if current_user.role == 'citizen' and v.reported_by != current_user.id:
        return jsonify({'message': 'Unauthorized'}), 403

    if v.status == 'paid':
        return jsonify({'message': 'Already paid'}), 400

    v.status = 'paid'
    v.paid_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Payment recorded successfully', 'violation': violation_to_dict(v)}), 200


@traffic_bp.route('/violations/<int:vid>', methods=['PUT'])
@token_required
def update_violation(current_user, vid):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    v = Violation.query.get(vid)
    if not v:
        return jsonify({'message': 'Violation not found'}), 404

    data = request.get_json() or {}
    for field in ['violation_type', 'description', 'fine_amount', 'status', 'location']:
        if field in data:
            setattr(v, field, data[field])

    db.session.commit()
    return jsonify({'message': 'Violation updated', 'violation': violation_to_dict(v)}), 200


@traffic_bp.route('/violations/<int:vid>', methods=['DELETE'])
@token_required
def delete_violation(current_user, vid):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    v = Violation.query.get(vid)
    if not v:
        return jsonify({'message': 'Violation not found'}), 404

    db.session.delete(v)
    db.session.commit()
    return jsonify({'message': 'Violation deleted'}), 200
