from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from .config import Config

db = SQLAlchemy()
migrate = Migrate()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app, resources={r'/api/*': {'origins': '*'}})

    db.init_app(app)
    migrate.init_app(app, db)

    from app import models  # noqa: F401 — ensures models are registered

    from app.routes.auth     import auth_bp
    from app.routes.traffic  import traffic_bp
    from app.routes.vehicles import vehicles_bp
    from app.routes.cameras  import cameras_bp
    from app.routes.users    import users_bp
    from app.routes.reports  import reports_bp

    app.register_blueprint(auth_bp,     url_prefix='/api/auth')
    app.register_blueprint(traffic_bp,  url_prefix='/api/traffic')
    app.register_blueprint(vehicles_bp, url_prefix='/api/vehicles')
    app.register_blueprint(cameras_bp,  url_prefix='/api/cameras')
    app.register_blueprint(users_bp,    url_prefix='/api/users')
    app.register_blueprint(reports_bp,  url_prefix='/api/reports')

    with app.app_context():
        db.create_all()
        _run_migrations()
        _seed_cameras()
        _seed_admin()

    @app.route('/')
    def home():
        return {'message': 'TrafficTrack API is running', 'version': '2.0'}

    @app.errorhandler(404)
    def not_found(e):
        return {'message': 'Endpoint not found'}, 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return {'message': 'Method not allowed'}, 405

    @app.errorhandler(500)
    def server_error(e):
        return {'message': 'Internal server error'}, 500

    return app


def _run_migrations():
    """Add any missing columns to existing tables without data loss."""
    conn = db.engine.raw_connection()
    cur  = conn.cursor()
    migrations = [
        # violations extras
        "ALTER TABLE violations ADD COLUMN IF NOT EXISTS location  VARCHAR(255)",
        "ALTER TABLE violations ADD COLUMN IF NOT EXISTS paid_at   TIMESTAMP",
        # indexes for fast filtering
        "CREATE INDEX IF NOT EXISTS idx_violations_status         ON violations(status)",
        "CREATE INDEX IF NOT EXISTS idx_violations_vehicle_number ON violations(vehicle_number)",
        "CREATE INDEX IF NOT EXISTS idx_violations_reported_by    ON violations(reported_by)",
        "CREATE INDEX IF NOT EXISTS idx_vehicles_status           ON vehicles(status)",
    ]
    for sql in migrations:
        try:
            cur.execute(sql)
        except Exception as exc:
            print(f'[migration] skipped: {exc}')
    conn.commit()
    cur.close()
    conn.close()


def _seed_cameras():
    from app.models import Camera
    if Camera.query.count() > 0:
        return
    cameras = [
        Camera(name='Main Junction Cam',  location='Main St & 1st Ave',        latitude=40.7128, longitude=-74.0060, status='active',      ai_enabled=True,  violations_detected=142),
        Camera(name='Highway North Gate', location='Highway 101 Northbound',    latitude=40.7282, longitude=-74.0776, status='active',      ai_enabled=True,  violations_detected=89),
        Camera(name='Downtown Crossing',  location='5th Ave & Broadway',        latitude=40.7549, longitude=-73.9840, status='offline',     ai_enabled=False, violations_detected=56),
        Camera(name='Airport Approach',   location='Airport Rd Eastbound',      latitude=40.6413, longitude=-73.7781, status='active',      ai_enabled=True,  violations_detected=204),
        Camera(name='School Zone Cam',    location='Oak St near Lincoln School', latitude=40.7306, longitude=-73.9352, status='maintenance', ai_enabled=False, violations_detected=33),
        Camera(name='Bridge Checkpoint',  location='Central Bridge, Lane 2',    latitude=40.7027, longitude=-74.0157, status='active',      ai_enabled=True,  violations_detected=77),
    ]
    for c in cameras:
        db.session.add(c)
    db.session.commit()
    print('[seed] 6 demo cameras created')


def _seed_admin():
    from app.models import User
    from werkzeug.security import generate_password_hash
    if User.query.filter_by(email='admin@demo.com').first():
        return
    admin = User(
        name          = 'Demo Admin',
        email         = 'admin@demo.com',
        password_hash = generate_password_hash('demo1234', method='pbkdf2:sha256'),
        role          = 'admin',
    )
    db.session.add(admin)
    db.session.commit()
    print('[seed] Demo admin created — admin@demo.com / demo1234')
