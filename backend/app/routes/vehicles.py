from flask import Blueprint, request, jsonify
from app.models import Vehicle, Violation
from app import db
from app.middleware import token_required
from sqlalchemy import func

vehicles_bp = Blueprint('vehicles', __name__)


def vehicle_to_dict(v, violation_count=0):
    return {
        'id'           : v.id,
        'vehicle_number': v.vehicle_number,
        'owner_name'   : v.owner_name,
        'owner_email'  : v.owner_email   or '',
        'owner_phone'  : v.owner_phone   or '',
        'vehicle_type' : v.vehicle_type  or 'Car',
        'make'         : v.make          or '',
        'model'        : v.model         or '',
        'year'         : v.year,
        'color'        : v.color         or '',
        'status'       : v.status        or 'active',
        'violations'   : violation_count,
        'created_at'   : v.created_at.isoformat() if v.created_at else None,
    }


@vehicles_bp.route('', methods=['GET'])
@token_required
def get_vehicles(current_user):
    search       = request.args.get('search', '').strip().upper()
    status_filter= request.args.get('status', '')
    vehicle_type = request.args.get('type', '')

    query = Vehicle.query

    if search:
        query = query.filter(
            Vehicle.vehicle_number.ilike(f'%{search}%') |
            Vehicle.owner_name.ilike(f'%{search}%')
        )
    if status_filter:
        query = query.filter_by(status=status_filter)
    if vehicle_type:
        query = query.filter_by(vehicle_type=vehicle_type)

    vehicles = query.order_by(Vehicle.created_at.desc()).all()
    if not vehicles:
        return jsonify({'vehicles': []}), 200

    # Bulk violation count — single query instead of N+1
    vehicle_numbers = [v.vehicle_number for v in vehicles]
    counts = dict(
        db.session.query(
            Violation.vehicle_number,
            func.count(Violation.id).label('cnt'),
        ).filter(
            Violation.vehicle_number.in_(vehicle_numbers)
        ).group_by(Violation.vehicle_number).all()
    )

    result = [vehicle_to_dict(v, counts.get(v.vehicle_number, 0)) for v in vehicles]
    return jsonify({'vehicles': result}), 200


@vehicles_bp.route('', methods=['POST'])
@token_required
def add_vehicle(current_user):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    for field in ['vehicle_number', 'owner_name']:
        if not data.get(field):
            return jsonify({'message': f'Missing required field: {field}'}), 400

    plate = data['vehicle_number'].strip().upper()
    if Vehicle.query.filter_by(vehicle_number=plate).first():
        return jsonify({'message': f'Vehicle {plate} is already registered'}), 400

    vehicle = Vehicle(
        vehicle_number=plate,
        owner_name    =data['owner_name'].strip(),
        owner_email   =data.get('owner_email', '').strip(),
        owner_phone   =data.get('owner_phone', '').strip(),
        vehicle_type  =data.get('vehicle_type', 'Car'),
        make          =data.get('make', '').strip(),
        model         =data.get('model', '').strip(),
        year          =data.get('year'),
        color         =data.get('color', '').strip(),
        status        ='active',
        registered_by =current_user.id,
    )
    db.session.add(vehicle)
    db.session.commit()

    return jsonify({'message': 'Vehicle registered successfully', 'id': vehicle.id}), 201


@vehicles_bp.route('/<int:vid>', methods=['PUT'])
@token_required
def update_vehicle(current_user, vid):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    vehicle = Vehicle.query.get(vid)
    if not vehicle:
        return jsonify({'message': 'Vehicle not found'}), 404

    data = request.get_json() or {}
    for field in ['owner_name', 'owner_email', 'owner_phone', 'vehicle_type',
                  'make', 'model', 'year', 'color', 'status']:
        if field in data:
            setattr(vehicle, field, data[field])

    db.session.commit()
    cnt = db.session.query(func.count(Violation.id)).filter_by(vehicle_number=vehicle.vehicle_number).scalar() or 0
    return jsonify({'message': 'Vehicle updated', 'vehicle': vehicle_to_dict(vehicle, cnt)}), 200


@vehicles_bp.route('/<int:vid>', methods=['DELETE'])
@token_required
def delete_vehicle(current_user, vid):
    if current_user.role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403

    vehicle = Vehicle.query.get(vid)
    if not vehicle:
        return jsonify({'message': 'Vehicle not found'}), 404

    db.session.delete(vehicle)
    db.session.commit()
    return jsonify({'message': 'Vehicle deleted'}), 200
