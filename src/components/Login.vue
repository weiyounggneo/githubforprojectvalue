<template>
  <div class="login-container">
    <div class="login-left">
      <div class="logo-title">
        <img src="@/assets/st-logo.png" alt="ST Logo" class="logo" />
        <span class="title">Project Value Calculation</span>
      </div>

      <div class="center-icon-wrapper">
        <img
          src="@/assets/Transparent_WHITE.png"
          alt="Project Value Calculation"
          class="center-icon"
        />
      </div>
    </div>

    <div class="login-right">
      <form class="login-form" @submit.prevent="onLogin">
        <h2>Log In</h2>

        <label for="username">Username</label>
        <input
          id="username"
          type="text"
          v-model.trim="username"
          required
          :disabled="isSubmitting"
          autocomplete="username"
        />

        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          v-model="password"
          required
          :disabled="isSubmitting"
          autocomplete="current-password"
        />

        <button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'LOGGING IN...' : 'LOG IN' }}
        </button>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <!-- NEW: About Application Link -->
        <div class="about-link-container">
          <a href="#" @click.prevent="showAboutModal = true" class="about-link">About this</a>
        </div>
      </form>
    </div>

    <!-- NEW: About Application Modal -->
    <div v-if="showAboutModal" class="modal-overlay">
      <div class="modal about-modal">
        <h3>About Project Value Entry</h3>
        
        <div class="about-content">
          <p class="team-credit"><strong>Developed by the MDS Maintenance Team</strong></p>
          
          <p><strong>Our Purpose:</strong> This application was created to replace manual spreadsheet tracking with a centralized, secure, and user-friendly platform for managing project KPIs.</p>
          
          <h4>System Architecture & Data Flow</h4>
          <ul class="architecture-list">
            <li><strong>The Interface (GUI):</strong> This web application provides a strict, validated environment to input and update weekly KPI metrics.</li>
            <li><strong>The Central Database:</strong> Every update made through this GUI is instantly saved to a secure, centralized MariaDB database, establishing our single source of truth.</li>
            <li><strong>Spotfire Analytics:</strong> TIBCO Spotfire connects directly to this exact same database. This ensures that all analytical dashboards always reflect the latest live data entered here, with zero manual data transfer required.</li>
          </ul>
        </div>

        <div class="modal-actions">
          <button type="button" @click="showAboutModal = false" class="close-btn">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LoginPage',
  data() {
    return {
      username: '',
      password: '',
      error: '',
      isSubmitting: false,
      showAboutModal: false // NEW: Controls the visibility of the about modal
    };
  },
  methods: {
    async onLogin() {
      if (this.isSubmitting) return;

      this.error = '';
      this.isSubmitting = true;

      try {
        const response = await fetch(`${process.env.VUE_APP_API_URL}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: this.username,
            password: this.password
          })
        });

        const data = await response.json();

        if (data.success && data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', this.username);
          localStorage.setItem('access_right', data.access_right || '');
          this.$router.push('/landing');
        } else {
          this.error = data.message || 'Login failed';
        }
      } catch (err) {
        this.error = 'Server error. Please try again later.';
      } finally {
        this.isSubmitting = false;
      }
    }
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  min-height: 100vh;
  border: 1px solid #1a3353;
  font-family: Arial, Helvetica, sans-serif;
}

.login-left {
  background: #07254a;
  color: #fff;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 40px;
}

.logo-title {
  display: flex;
  align-items: center;
}

.logo {
  width: 120px;
  margin-bottom: 15px;
  margin-right: 20px;
  margin-top: 15px;
}

.title {
  font-size: 1.5rem;
  font-weight: bold;
  color: #fff;
  white-space: nowrap;
}

.center-icon-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.center-icon {
  max-width: 500px;
  max-height: 500px;
  width: 100%;
  height: auto;
}

.login-right {
  flex: 1;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-form {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: #fff;
  padding: 32px 28px;
  border-radius: 14px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.login-form h2 {
  color: #07254a;
  font-size: 2rem;
  margin-bottom: 24px;
  text-align: center;
}

.login-form label {
  font-weight: 600;
  color: #07254a;
  margin-bottom: 8px;
  margin-top: 12px;
}

.login-form input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid #cfd6df;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.login-form input:focus {
  border-color: #1f5fa8;
  box-shadow: 0 0 0 3px rgba(31, 95, 168, 0.12);
}

.login-form button[type="submit"] {
  margin-top: 24px;
  width: 100%;
  padding: 14px 0;
  background: #ffd600;
  color: #07254a;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  font-size: 1.05rem;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.login-form button[type="submit"]:hover:not(:disabled) {
  background: #ffea00;
  transform: translateY(-1px);
}

.login-form button[type="submit"]:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error-message {
  color: #d93025;
  margin-top: 14px;
  font-size: 0.95rem;
  text-align: center;
}

/* --- NEW STYLES: About Link & Modal --- */
.about-link-container {
  text-align: center;
  margin-top: 24px;
}

.about-link {
  color: #1f5fa8;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 600;
  transition: color 0.2s;
}

.about-link:hover {
  color: #07254a;
  text-decoration: underline;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal {
  background: #fff;
  padding: 32px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 600px;
  text-align: left;
}

.modal h3 {
  margin-top: 0;
  color: #07254a;
  font-size: 1.5rem;
  border-bottom: 2px solid #e7edf5;
  padding-bottom: 12px;
}

.about-content {
  margin: 20px 0 24px 0;
  line-height: 1.6;
  color: #333;
}

.team-credit {
  color: #1f5fa8;
  font-size: 1.1rem;
  margin-bottom: 16px;
}

.about-content h4 {
  margin-top: 24px;
  margin-bottom: 12px;
  color: #07254a;
  font-size: 1.1rem;
}

.architecture-list {
  padding-left: 20px;
  margin-top: 8px;
}

.architecture-list li {
  margin-bottom: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.close-btn {
  background: #e0e6ed;
  color: #07254a;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #cfd6df;
}
</style>