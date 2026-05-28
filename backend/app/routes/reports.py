from flask import Blueprint, request, jsonify
from app.models import Violation, Vehicle, User, Camera
from app import db
from app.middleware import token_required
from sqlalchemy import func, extract
from datetime import datetime, timedelta

reports_bp = Blueprint('reports', __name__)


@reports_bp.route('/stats', methods=['GET'])
@token_required
def get_stats(current_user):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    total_violations = Violation.query.count()
    pending = Violation.query.filter_by(status='pending').count()
    paid = Violation.query.filter_by(status='paid').count()
    contested = Violation.query.filter_by(status='contested').count()

    revenue_result = db.session.query(func.sum(Violation.fine_amount)).filter_by(status='paid').scalar()
    total_revenue = float(revenue_result or 0)

    pending_revenue_result = db.session.query(func.sum(Violation.fine_amount)).filter_by(status='pending').scalar()
    pending_revenue = float(pending_revenue_result or 0)

    total_vehicles = Vehicle.query.count()
    total_users = User.query.count()
    total_cameras = Camera.query.count()
    active_cameras = Camera.query.filter_by(status='active').count()

    return jsonify({
        'violations': {
            'total': total_violations,
            'pending': pending,
            'paid': paid,
            'contested': contested,
        },
        'revenue': {
            'collected': total_revenue,
            'pending': pending_revenue,
            'total': total_revenue + pending_revenue,
        },
        'vehicles': total_vehicles,
        'users': total_users,
        'cameras': {'total': total_cameras, 'active': active_cameras},
    }), 200


@reports_bp.route('/violations-by-type', methods=['GET'])
@token_required
def violations_by_type(current_user):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    rows = db.session.query(
        Violation.violation_type,
        func.count(Violation.id).label('count'),
        func.sum(Violation.fine_amount).label('total_fines'),
    ).group_by(Violation.violation_type).order_by(func.count(Violation.id).desc()).all()

    return jsonify({
        'data': [
            {
                'type': r.violation_type,
                'count': r.count,
                'total_fines': float(r.total_fines or 0),
            }
            for r in rows
        ]
    }), 200


@reports_bp.route('/violations-by-month', methods=['GET'])
@token_required
def violations_by_month(current_user):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    six_months_ago = datetime.utcnow() - timedelta(days=180)

    rows = db.session.query(
        extract('year',  Violation.created_at).label('year'),
        extract('month', Violation.created_at).label('month'),
        func.count(Violation.id).label('count'),
        func.sum(Violation.fine_amount).label('revenue'),
    ).filter(
        Violation.created_at >= six_months_ago
    ).group_by('year', 'month').order_by('year', 'month').all()

    import calendar
    result = []
    for r in rows:
        month_name = calendar.month_abbr[int(r.month)]
        result.append({
            'label': f"{month_name} {int(r.year)}",
            'count': r.count,
            'revenue': float(r.revenue or 0),
        })

    return jsonify({'data': result}), 200


@reports_bp.route('/top-vehicles', methods=['GET'])
@token_required
def top_vehicles(current_user):
    if current_user.role not in ('admin', 'officer'):
        return jsonify({'message': 'Unauthorized'}), 403

    rows = db.session.query(
        Violation.vehicle_number,
        func.count(Violation.id).label('count'),
        func.sum(Violation.fine_amount).label('total_fines'),
    ).group_by(Violation.vehicle_number).order_by(func.count(Violation.id).desc()).limit(10).all()

    return jsonify({
        'data': [
            {
                'vehicle_number': r.vehicle_number,
                'count': r.count,
                'total_fines': float(r.total_fines or 0),
            }
            for r in rows
        ]
    }), 200
