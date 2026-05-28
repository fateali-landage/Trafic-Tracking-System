from app import db
from datetime import datetime


class User(db.Model):
    __tablename__ = 'users'
    id            = db.Column(db.Integer,     primary_key=True)
    name          = db.Column(db.String(100), nullable=False)
    email         = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role          = db.Column(db.String(20),  default='citizen')
    created_at    = db.Column(db.DateTime,    default=datetime.utcnow)

    violations = db.relationship('Violation', backref='reporter', lazy=True,
                                 foreign_keys='Violation.reported_by')
    vehicles   = db.relationship('Vehicle',   backref='registrar', lazy=True,
                                 foreign_keys='Vehicle.registered_by')


class Violation(db.Model):
    __tablename__ = 'violations'
    id             = db.Column(db.Integer,       primary_key=True)
    vehicle_number = db.Column(db.String(20),    nullable=False, index=True)
    violation_type = db.Column(db.String(100),   nullable=False)
    description    = db.Column(db.Text)
    fine_amount    = db.Column(db.Numeric(10, 2),nullable=False)
    status         = db.Column(db.String(20),    default='pending', index=True)
    location       = db.Column(db.String(200))
    reported_by    = db.Column(db.Integer,       db.ForeignKey('users.id'), index=True)
    paid_at        = db.Column(db.DateTime)
    created_at     = db.Column(db.DateTime,      default=datetime.utcnow)


class Vehicle(db.Model):
    __tablename__ = 'vehicles'
    id             = db.Column(db.Integer,   primary_key=True)
    vehicle_number = db.Column(db.String(20),unique=True, nullable=False)
    owner_name     = db.Column(db.String(100),nullable=False)
    owner_email    = db.Column(db.String(100))
    owner_phone    = db.Column(db.String(20))
    vehicle_type   = db.Column(db.String(50), default='Car')
    make           = db.Column(db.String(50))
    model          = db.Column(db.String(50))
    year           = db.Column(db.Integer)
    color          = db.Column(db.String(30))
    status         = db.Column(db.String(20), default='active', index=True)
    registered_by  = db.Column(db.Integer,    db.ForeignKey('users.id'))
    created_at     = db.Column(db.DateTime,   default=datetime.utcnow)


class Camera(db.Model):
    __tablename__ = 'cameras'
    id                  = db.Column(db.Integer,   primary_key=True)
    name                = db.Column(db.String(100),nullable=False)
    location            = db.Column(db.String(200),nullable=False)
    latitude            = db.Column(db.Float)
    longitude           = db.Column(db.Float)
    status              = db.Column(db.String(20), default='active')
    ai_enabled          = db.Column(db.Boolean,    default=False)
    violations_detected = db.Column(db.Integer,    default=0)
    created_at          = db.Column(db.DateTime,   default=datetime.utcnow)
