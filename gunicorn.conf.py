# gunicorn.conf.py
"""
Gunicorn configuration for Raven SaaS production deployment.

Handles HTTP requests. WebSocket connections are served by Daphne separately.
"""
import multiprocessing

# Server socket
bind = '0.0.0.0:8000'
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'sync'
worker_connections = 1000
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 50

# Preload app for faster worker spawning and shared memory
preload_app = True

# Server mechanics
daemon = False
pidfile = None
umask = 0
tmp_upload_dir = None

# Logging
accesslog = '-'  # stdout
errorlog = '-'   # stderr
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = 'raven-gunicorn'

# Graceful restart
graceful_timeout = 30

# SSL is handled by nginx/DO load balancer, not gunicorn
forwarded_allow_ips = '*'
secure_scheme_headers = {
    'X-FORWARDED-PROTO': 'https',
}
