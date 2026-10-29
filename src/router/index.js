import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '@/components/Login.vue';
import LandingPage from '@/views/LandingPage.vue';
import ProjectValuePage from '@/views/project-values.vue';
import ProjectMasterPage from '@/views/ProjectMaster.vue';


const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
    meta: { public: true }
  },
  {
    path: '/landing',
    name: 'Landing',
    component: LandingPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/project-values',
    name: 'ProjectValues',
    component: ProjectValuePage,
    meta: { requiresAuth: true }
  },
  {
    path: '/project-master',
    name: 'ProjectMaster',
    component: ProjectMasterPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  
  
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  const accessRight = localStorage.getItem('access_right');

  if (to.meta.public) {
    return next();
  }

  if (to.meta.requiresAuth && !token) {
    return next('/login');
  }

  if (to.meta.requiresAdmin && accessRight !== 'admin') {
    return next('/landing');
  }

  return next();
});

export default router;