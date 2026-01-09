from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views # <--- Import this

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Auth Views
    path('login/', auth_views.LoginView.as_view(template_name='registration/login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    
    # Legacy schedulizer (old models)
    path('app/', include('scheduling.urls')),

    # New schedulizer (tenant-aware models)
    path('v2/', include('apps.scheduling.urls')),

    path('__reload__/', include('django_browser_reload.urls')),
]