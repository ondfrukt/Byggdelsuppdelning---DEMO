import os

class Config:
    """Configuration for the PLM application"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

    # Allow develop deployments to explicitly reuse main's database.
    branch_name = os.environ.get('RENDER_GIT_BRANCH', '').strip().lower()
    database_url = os.environ.get('DATABASE_URL')
    if branch_name == 'develop':
        database_url = os.environ.get('MAIN_DATABASE_URL', database_url)
    if not database_url:
        database_url = 'postgresql://localhost/plm_demo'

    # Handle both postgres:// and postgresql:// URLs (Render compatibility)
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)

    SQLALCHEMY_DATABASE_URI = database_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
    }
