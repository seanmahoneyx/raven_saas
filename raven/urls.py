from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views

urlpatterns = [
    path('admin/', admin.site.urls),

    # REST API
    path('api/', include('apps.api.urls')),

    # Auth Views
    path('login/', auth_views.LoginView.as_view(template_name='registration/login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),

    # Schedulizer (tenant-aware models)
    path('app/', include('apps.scheduling.urls')),

    path('__reload__/', include('django_browser_reload.urls')),
]