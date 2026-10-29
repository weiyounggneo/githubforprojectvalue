<template>
  <div class="table-gui-page">
    <!-- Loading Overlay -->
    <div v-if="isPageLoading" class="loading-overlay">
      <div class="loading-box">
        <div class="spinner"></div>
        <div class="loading-text">Loading data, please wait...</div>
      </div>
    </div>

    <!-- Processing Overlay -->
    <div v-if="isProcessing && !isPageLoading" class="loading-overlay">
      <div class="loading-box">
        <div class="loading-text">{{ processingMessage || 'Processing, please wait...' }}</div>
        <div class="loading-subtext">Please do not refresh or close the page.</div>
        <div class="loading-bar-wrapper">
          <div class="loading-bar-indeterminate"></div>
        </div>
      </div>
    </div>

    <header class="top-bar">
      <div class="left">
        <img src="@/assets/st-logo.png" alt="ST Logo" class="logo" />
        <span class="title">
          Project Value Calculation:<br />
          Project Master
        </span>
      </div>

      <div class="topbar-actions">
        <button class="back-btn" @click="goBack" :disabled="isProcessing || isPageLoading">Back</button>
        <button class="home-btn" @click="goHome" :disabled="isProcessing || isPageLoading">Home</button>
        <button class="logout-btn" @click="logout" :disabled="isProcessing || isPageLoading">Logout</button>
      </div>
    </header>

    <div class="upload-section" v-if="isAdmin">
      <label
        class="uploadExport-label"
        :style="{ pointerEvents: isProcessing || isPageLoading ? 'none' : 'auto', opacity: isProcessing || isPageLoading ? 0.6 : 1 }"
      >
        <input type="file" accept=".xlsx,.xls" @change="handleExcelUpload" style="display: none;" />
        <span class="upload-icon" title="Upload Excel">
          <img src="@/assets/excel.png" alt="Upload" class="icon-img" />
          <span style="margin-left: 6px;">Upload Excel</span>
        </span>
      </label>
    </div>

    <div class="table-section" v-if="goodTableColumns.length > 0">
      <div class="inline-edit-hint" v-if="isAdmin">
        💡 <strong>Tip:</strong> Double-click a Project Name, Type, Status, Investment, or Description to edit it directly.
      </div>

      <vue-good-table
        :columns="goodTableColumns"
        :rows="filteredRows"
        :pagination-options="{ enabled: true, perPage: 10 }"
        :line-numbers="true"
        @row-click="selectRow"
        :rowStyleClass="rowClassFn"
      >
        <template #table-row="props">
          <span v-if="['project_name', 'project_type', 'project_status', 'use_case_investment', 'project_description'].includes(props.column.field)">
            
            <span v-if="editingCell.rowId === props.row.project_code && editingCell.field === props.column.field">
              
              <!-- Dropdown for Project Type -->
              <select 
                v-if="props.column.field === 'project_type'"
                v-model="editValue"
                @blur="saveInlineEdit(props.row)"
                @keyup.enter="saveInlineEdit(props.row)"
                @keyup.esc="cancelInlineEdit"
                v-focus
                class="inline-input"
              >
                <option value="">Please Select</option>
                <option v-for="type in projectTypesOptions" :key="type" :value="type">{{ type }}</option>
              </select>

              <!-- Dropdown for Project Status -->
              <select 
                v-else-if="props.column.field === 'project_status'"
                v-model="editValue"
                @blur="saveInlineEdit(props.row)"
                @keyup.enter="saveInlineEdit(props.row)"
                @keyup.esc="cancelInlineEdit"
                v-focus
                class="inline-input"
              >
                <option v-for="status in projectStatusesOptions" :key="status" :value="status">{{ status }}</option>
              </select>

              <!-- Number Input for Investment -->
              <input
                v-else-if="props.column.field === 'use_case_investment'"
                type="number"
                step="any"
                v-model="editValue"
                @blur="saveInlineEdit(props.row)"
                @keyup.enter="saveInlineEdit(props.row)"
                @keyup.esc="cancelInlineEdit"
                v-focus
                class="inline-input"
              />

              <!-- Text Input for Name and Description -->
              <input
                v-else
                type="text"
                v-model="editValue"
                @blur="saveInlineEdit(props.row)"
                @keyup.enter="saveInlineEdit(props.row)"
                @keyup.esc="cancelInlineEdit"
                v-focus
                class="inline-input"
                :style="props.column.field === 'project_description' ? 'width: 100%; min-width: 300px;' : 'width: 100%;'"
              />
            </span>
            
            <!-- Standard Formatted Cell -->
            <span 
              v-else 
              @dblclick.stop="startInlineEdit(props.row, props.column.field, props.row[props.column.field])" 
              :class="{ 'editable-cell': isAdmin }"
              :title="isAdmin ? 'Double-click to edit' : ''"
            >
              <template v-if="props.column.field === 'use_case_investment'">
                {{ formatCurrency(props.row[props.column.field]) }}
              </template>
              <template v-else-if="props.column.field === 'project_status'">
                <span class="status-badge" :class="props.row[props.column.field] ? props.row[props.column.field].toLowerCase().replace(' ', '-') : ''">
                  {{ props.formattedRow[props.column.field] }}
                </span>
              </template>
              <template v-else>
                {{ props.formattedRow[props.column.field] }}
              </template>
            </span>
          </span>

          <span v-else>
            {{ props.formattedRow[props.column.field] }}
          </span>
        </template>

        <template #emptystate>
          <div class="no-data-message">No data available.</div>
        </template>
      </vue-good-table>
    </div>

    <!-- Action Buttons -->
    <div class="actions">
      <button
        v-for="btn in visibleActionButtons"
        :key="btn.key"
        @click="btn.onClick"
        :disabled="isProcessing || isPageLoading"
      >
        {{ btn.label }}
      </button>
    </div>

    <!-- Selected Row Audit Panel -->
    <div v-if="selectedRow" class="audit-panel">
      <h4>Selected Project Information</h4>
      <div class="audit-grid">
        <div><strong>Project Code:</strong> {{ selectedRow.project_code || '-' }}</div>
        <div><strong>Project Name:</strong> {{ selectedRow.project_name || '-' }}</div>
        <div><strong>Project Type:</strong> {{ selectedRow.project_type || '-' }}</div>
        <div><strong>Project Status:</strong> {{ selectedRow.project_status || '-' }}</div>
        <div><strong>Use Case Investment:</strong> {{ formatCurrency(selectedRow.use_case_investment) || '-' }}</div>
        <div class="full-width-audit"><strong>Project Description:</strong> {{ selectedRow.project_description || '-' }}</div>
      </div>
    </div>

    <!-- Row-Level History Modal -->
    <div v-if="showHistoryModal" class="modal-overlay">
      <div class="modal large-modal">
        <h3>Version History: {{ selectedRow?.project_name }} ({{ selectedRow?.project_code }})</h3>
        
        <div v-if="isFetchingHistory" style="text-align: center; padding: 20px;">
           <div class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></div>
           <p>Loading historical data...</p>
        </div>
        
        <div v-else class="history-table-container">
          <table class="history-table">
            <thead>
              <tr>
                <th>Date Changed</th>
                <th>Changed By</th>
                <th>Action</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Investment</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="log in historyData" 
                :key="log.history_id"
                :class="{ 'current-row': log.action_type === 'CURRENT' }"
              >
                <td>{{ log.changed_at }}</td>
                <td><strong>{{ log.changed_by }}</strong></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="badge" :class="{'badge-current': log.action_type === 'CURRENT'}">
                      {{ log.action_type === 'UPDATE' ? 'PREVIOUS' : log.action_type }}
                    </span>
                    <!-- NEW: Revert Button -->
                    <button 
                      v-if="log.action_type !== 'CURRENT' && isAdmin" 
                      class="restore-btn" 
                      @click="restoreHistoricalRecord(log)"
                      title="Revert live record to this version"
                    >
                      Restore
                    </button>
                  </div>
                </td>
                <td>{{ log.project_name }}</td>
                <td>{{ log.project_type }}</td>
                <td>{{ log.project_status }}</td>
                <td>{{ formatCurrency(log.use_case_investment) }}</td>
                <td class="history-desc" :title="log.project_description">{{ log.project_description }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="historyData.length === 1" style="text-align: center; padding: 16px; color: #666; font-size: 0.9rem;">
            No previous edits found for this project. The current version is the original.
          </p>
        </div>

        <div class="modal-actions">
          <button type="button" class="actions cancel" @click="showHistoryModal = false">Close</button>
        </div>
      </div>
    </div>

    <!-- Global Audit Log Modal -->
    <div v-if="showGlobalHistoryModal" class="modal-overlay">
      <div class="modal x-large-modal">
        <h3>Global Audit Log: Project Master</h3>
        
        <div v-if="isFetchingGlobalHistory" style="text-align: center; padding: 20px;">
           <div class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></div>
           <p>Loading global audit data...</p>
        </div>
        
        <div v-else class="global-history-table-container" style="margin-top: 16px;">
          <vue-good-table
            :columns="globalHistoryColumns"
            :rows="globalHistoryData"
            :pagination-options="{ enabled: true, perPage: 10 }"
            :search-options="{ enabled: true, placeholder: 'Search entire audit log...' }"
            :row-style-class="globalRowClassFn"
          >
            <template #table-row="props">
              <span v-if="props.column.field === 'action_type'">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge" :class="{'badge-current': props.row.action_type === 'CURRENT'}">
                    {{ props.row.action_type === 'UPDATE' ? 'PREVIOUS' : props.row.action_type }}
                  </span>
                  <!-- NEW: Revert Button -->
                  <button 
                    v-if="props.row.action_type !== 'CURRENT' && isAdmin" 
                    class="restore-btn" 
                    @click="restoreHistoricalRecord(props.row)"
                    title="Revert live record to this version"
                  >
                    Restore
                  </button>
                </div>
              </span>
              <span v-else-if="props.column.field === 'use_case_investment'">
                {{ formatCurrency(props.row.use_case_investment) }}
              </span>
              <span v-else>
                {{ props.formattedRow[props.column.field] }}
              </span>
            </template>
            <template #emptystate>
              <div class="no-data-message">No audit logs found.</div>
            </template>
          </vue-good-table>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="actions cancel" @click="showGlobalHistoryModal = false">Close</button>
        </div>
      </div>
    </div>

    <!-- Admin-only user access management -->
    <div v-if="showAccessModal && isAdmin" class="modal-overlay">
      <div class="modal large-modal access-modal">
        <h3>Manage User Access</h3>
        <p>Use the LDAP username. New admin access takes effect when that user signs in again.</p>

        <form class="access-form" @submit.prevent="addUserAccess">
          <div class="form-group">
            <label for="access-username">Username</label>
            <input id="access-username" v-model.trim="accessForm.username"
              autocomplete="off" placeholder="LDAP username" maxlength="128"
              :disabled="isProcessing" required />
          </div>
          <div class="form-group">
            <label for="access-right">Access right</label>
            <select id="access-right" v-model="accessForm.access_right" :disabled="isProcessing">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" class="actions formButton" :disabled="isProcessing || isFetchingAccess">Add User</button>
        </form>

        <div v-if="accessError" class="form-error" role="alert">{{ accessError }}</div>
        <p v-if="accessSuccess" class="access-success" role="status">{{ accessSuccess }}</p>

        <div v-if="isFetchingAccess" class="access-loading">Loading user access...</div>
        <div v-else class="history-table-container access-table-container">
          <table class="history-table">
            <thead><tr><th>Username</th><th>Access right</th><th>Action</th></tr></thead>
            <tbody>
              <tr v-for="(entry, index) in accessRows" :key="entry.username + '-' + index">
                <td>{{ entry.username }}</td>
                <td>{{ entry.access_right || 'No role' }}</td>
                <td>
                  <button type="button" class="restore-btn"
                    :disabled="isProcessing || (entry.username.toLowerCase() === currentUsername.toLowerCase() && entry.access_right === 'admin')"
                    @click="changeUserAccess(entry)">
                    {{ entry.access_right === 'admin' ? 'Set as User' : 'Make Admin' }}
                  </button>
                </td>
              </tr>
              <tr v-if="!accessRows.length"><td colspan="3">No user access entries found.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="button" class="actions cancel" :disabled="isProcessing"
            @click="showAccessModal = false">Close</button>
        </div>
      </div>
    </div>

    <!-- Add Project Modal -->
    <div v-if="showAddForm" class="modal-overlay">
      <div class="modal large-modal">
        <h3>Add New Project</h3>
        <form @submit.prevent="submitAddForm">
          <div class="form-grid">
            <div class="form-group">
              <label for="project_code">Project Code</label>
              <input
                id="project_code"
                v-model="addForm.project_code"
                disabled
                title="Project code is automatically generated"
                style="background-color: #e9ecef; cursor: not-allowed; color: #495057; font-weight: bold;"
              />
              <div v-if="addError.project_code" class="form-error">{{ addError.project_code }}</div>
            </div>

            <div class="form-group">
              <label for="project_name">Project Name</label>
              <input
                id="project_name"
                v-model="addForm.project_name"
                :disabled="isProcessing"
              />
              <div v-if="addError.project_name" class="form-error">{{ addError.project_name }}</div>
            </div>

            <div class="form-group">
              <label for="project_type">Project Type (Model Type)</label>
              <select
                id="project_type"
                v-model="addForm.project_type"
                :disabled="isProcessing"
              >
                <option value="">Please Select</option>
                <option v-for="type in projectTypesOptions" :key="type" :value="type">{{ type }}</option>
              </select>
              <div v-if="addError.project_type" class="form-error">{{ addError.project_type }}</div>
            </div>

            <div class="form-group">
              <label for="project_status">Project Status</label>
              <select
                id="project_status"
                v-model="addForm.project_status"
                :disabled="isProcessing"
              >
                <option v-for="status in projectStatusesOptions" :key="status" :value="status">{{ status }}</option>
              </select>
            </div>

            <div class="form-group">
              <label for="use_case_investment">Use Case Investment</label>
              <input
                id="use_case_investment"
                type="number"
                step="any"
                v-model="addForm.use_case_investment"
                :disabled="isProcessing"
              />
              <div v-if="addError.use_case_investment" class="form-error">{{ addError.use_case_investment }}</div>
            </div>

            <div class="form-group full-width">
              <label for="project_description">Project Description</label>
              <textarea
                id="project_description"
                rows="4"
                v-model="addForm.project_description"
                :disabled="isProcessing"
              ></textarea>
              <div v-if="addError.project_description" class="form-error">{{ addError.project_description }}</div>
            </div>
          </div>

          <div class="modal-actions">
            <button type="submit" class="actions formButton" :disabled="isProcessing">
              {{ isProcessing ? 'Adding...' : 'Add' }}
            </button>
            <button type="button" class="actions cancel" @click="closeAddForm" :disabled="isProcessing">
              Cancel
            </button>
          </div>

          <div v-if="addError.general" class="form-error">{{ addError.general }}</div>
        </form>
      </div>
    </div>

    <!-- Update Project Modal -->
    <div v-if="showUpdateForm" class="modal-overlay">
      <div class="modal large-modal">
        <h3>Update Project</h3>
        <form @submit.prevent="submitUpdateForm">
          <div class="form-grid">
            <div class="form-group">
              <label for="update_project_code">Project Code</label>
              <input
                id="update_project_code"
                v-model="updateForm.project_code"
                disabled
                style="background-color: #e9ecef; cursor: not-allowed; color: #495057; font-weight: bold;"
              />
            </div>

            <div class="form-group">
              <label for="update_project_name">Project Name</label>
              <input
                id="update_project_name"
                v-model="updateForm.project_name"
                :disabled="isProcessing"
              />
              <div v-if="updateError.project_name" class="form-error">{{ updateError.project_name }}</div>
            </div>

            <div class="form-group">
              <label for="update_project_type">Project Type (Model Type)</label>
              <select
                id="update_project_type"
                v-model="updateForm.project_type"
                :disabled="isProcessing"
              >
                <option value="">Please Select</option>
                <option v-for="type in projectTypesOptions" :key="type" :value="type">{{ type }}</option>
              </select>
              <div v-if="updateError.project_type" class="form-error">{{ updateError.project_type }}</div>
            </div>

            <div class="form-group">
              <label for="update_project_status">Project Status</label>
              <select
                id="update_project_status"
                v-model="updateForm.project_status"
                :disabled="isProcessing"
              >
                <option v-for="status in projectStatusesOptions" :key="status" :value="status">{{ status }}</option>
              </select>
            </div>

            <div class="form-group">
              <label for="update_use_case_investment">Use Case Investment</label>
              <input
                id="update_use_case_investment"
                type="number"
                step="any"
                v-model="updateForm.use_case_investment"
                :disabled="isProcessing"
              />
              <div v-if="updateError.use_case_investment" class="form-error">{{ updateError.use_case_investment }}</div>
            </div>

            <div class="form-group full-width">
              <label for="update_project_description">Project Description</label>
              <textarea
                id="update_project_description"
                rows="4"
                v-model="updateForm.project_description"
                :disabled="isProcessing"
              ></textarea>
              <div v-if="updateError.project_description" class="form-error">{{ updateError.project_description }}</div>
            </div>
          </div>

          <div class="modal-actions">
            <button type="submit" class="actions formButton" :disabled="isProcessing">
              {{ isProcessing ? 'Updating...' : 'Update' }}
            </button>
            <button type="button" class="actions cancel" @click="closeUpdateForm" :disabled="isProcessing">
              Cancel
            </button>
          </div>

          <div v-if="updateError.general" class="form-error">{{ updateError.general }}</div>
        </form>
      </div>
    </div>

    <!-- Add Project Type Modal -->
    <div v-if="showAddTypeForm" class="modal-overlay">
      <div class="modal">
        <h3>Add New Project Type</h3>
        <form @submit.prevent="submitAddTypeForm">
          <div class="form-group" style="margin-bottom: 24px;">
            <label for="new_type_name">Project Type Name</label>
            <input
              id="new_type_name"
              v-model="addTypeForm.type_name"
              :disabled="isProcessing"
              placeholder="e.g., Natural Language Processing"
            />
            <div v-if="addTypeError" class="form-error">{{ addTypeError }}</div>
          </div>

          <div class="modal-actions">
            <button type="submit" class="actions formButton" :disabled="isProcessing">
              {{ isProcessing ? 'Adding...' : 'Add Type' }}
            </button>
            <button type="button" class="actions cancel" @click="closeAddTypeForm" :disabled="isProcessing">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Search Modal -->
    <div v-if="openSearchForm" class="modal-overlay">
      <div class="modal">
        <h3>Search Projects</h3>
        <form @submit.prevent="applyColumnFilters">
          <div class="search-form-columns">
            <div v-for="col in goodTableColumns" :key="col.field" class="search-form-group half-width">
              <label :for="'search-' + col.field">{{ col.label }}</label>
              <input
                :id="'search-' + col.field"
                v-model="columnFilters[col.field]"
                :placeholder="'Search ' + col.label"
                class="column-filter"
                :disabled="isProcessing"
              />
            </div>
          </div>

          <div class="modal-actions">
            <button type="submit" class="actions formButton" :disabled="isProcessing">Search</button>
            <button type="button" class="actions cancel" @click="resetFilters" :disabled="isProcessing">Reset</button>
            <button type="button" class="actions cancel" @click="closeSearchModal" :disabled="isProcessing">Close</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Success & Alert Dialogs -->
    <div v-if="showSuccessDialog" class="modal-overlay">
      <div class="confirmationmessage">
        <h3>Successful!</h3>
        <p>{{ successMessage }}</p>
        <div class="modal-actions">
          <button class="actions formButton" @click="showSuccessDialog = false" :disabled="isProcessing">OK</button>
        </div>
      </div>
    </div>

    <div v-if="showExcelResultDialog" class="modal-overlay">
      <div class="confirmationmessage">
        <h3>Excel Upload</h3>
        <p>{{ excelResultMessage }}</p>
        <div class="modal-actions">
          <button class="actions formButton" @click="showExcelResultDialog = false" :disabled="isProcessing">OK</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { VueGoodTable } from 'vue-good-table-next';
import 'vue-good-table-next/dist/vue-good-table-next.css';

export default {
  name: 'ProjectMasterPage',
  components: { VueGoodTable },

  directives: {
    focus: {
      mounted(el) {
        el.focus();
      }
    }
  },

  data() {
    return {
      columns: [],
      rows: [],
      filteredRows: [],
      selectedRow: null,

      projectTypesOptions: [],
      projectStatusesOptions: [],

      showAddForm: false,
      showUpdateForm: false,
      showAddTypeForm: false, 
      openSearchForm: false,
      showSuccessDialog: false,
      showExcelResultDialog: false,

      // State for Row History Modal
      showHistoryModal: false,
      historyData: [],
      isFetchingHistory: false,

      // State for Global History Modal
      showGlobalHistoryModal: false,
      globalHistoryData: [],
      isFetchingGlobalHistory: false,

      showAccessModal: false,
      accessRows: [],
      isFetchingAccess: false,
      accessForm: { username: '', access_right: 'user' },
      accessError: '',
      accessSuccess: '',

      isProcessing: false,
      isPageLoading: false,
      processingMessage: '',

      editingCell: { rowId: null, field: null },
      editValue: null,
      isSavingInline: false,

      addForm: {
        project_code: '',
        project_name: '',
        project_description: '',
        project_type: '',
        project_status: 'Active',
        use_case_investment: ''
      },

      updateForm: {
        original_project_code: '',
        project_code: '',
        project_name: '',
        project_description: '',
        project_type: '',
        project_status: '',
        use_case_investment: ''
      },

      addTypeForm: { 
        type_name: ''
      },

      addError: {},
      updateError: {},
      addTypeError: '', 
      successMessage: '',
      excelResultMessage: '',
      columnFilters: {}
    };
  },

  computed: {
    apiBasePath() {
      return `${process.env.VUE_APP_API_URL}/api/project-master`;
    },

    isAdmin() {
      return localStorage.getItem('access_right') === 'admin';
    },

    currentUsername() {
      return localStorage.getItem('username') || '';
    },

    globalHistoryColumns() {
      return [
        { label: 'Date Changed', field: 'changed_at' },
        { label: 'Changed By', field: 'changed_by' },
        { label: 'Action', field: 'action_type' },
        { label: 'Project Code', field: 'project_code' },
        { label: 'Name', field: 'project_name' },
        { label: 'Type', field: 'project_type' },
        { label: 'Status', field: 'project_status' },
        { label: 'Investment', field: 'use_case_investment' },
        { label: 'Description', field: 'project_description', width: '400px', tdClass: 'wrap-text-cell' }
      ];
    },

    goodTableColumns() {
      const preferredOrder = [
        'project_code',
        'project_name',
        'project_type',
        'project_status',
        'use_case_investment',
        'project_description'
      ];

      const orderedColumns = preferredOrder.filter(col => this.columns.includes(col));
      const remainingColumns = this.columns.filter(col => !preferredOrder.includes(col));

      return [...orderedColumns, ...remainingColumns].map(col => {
        let columnConfig = {
          label: this.getColumnLabel(col),
          field: col
        };

        if (col === 'project_description') {
          columnConfig.width = '400px'; 
          columnConfig.tdClass = 'wrap-text-cell';
        }

        return columnConfig;
      });
    },

    visibleActionButtons() {
      const buttons = [];

      if (this.isAdmin) {
        buttons.push({
          key: 'add',
          label: 'Add',
          onClick: () => {
            if (!this.isProcessing && !this.isPageLoading) {
              this.openAddForm();
            }
          }
        });

        buttons.push({
          key: 'update',
          label: 'Update',
          onClick: () => this.openUpdateForm()
        });

        buttons.push({
          key: 'history',
          label: 'View History',
          onClick: () => {
            if (!this.isProcessing && !this.isPageLoading) {
              this.openHistoryModal();
            }
          }
        });

        buttons.push({
          key: 'global-history',
          label: 'Global Audit Log',
          onClick: () => {
            if (!this.isProcessing && !this.isPageLoading) {
              this.openGlobalHistoryModal();
            }
          }
        });

        buttons.push({
          key: 'add-type',
          label: 'Add Project Type',
          onClick: () => {
            if (!this.isProcessing && !this.isPageLoading) {
              this.showAddTypeForm = true;
            }
          }
        });

        buttons.push({
          key: 'manage-access',
          label: 'Manage User Access',
          onClick: () => this.openAccessModal()
        });
      }

      buttons.push({
        key: 'search',
        label: 'Search',
        onClick: () => {
          if (!this.isProcessing && !this.isPageLoading) {
            this.openSearchForm = true;
          }
        }
      });

      buttons.push({
        key: 'clear-filter',
        label: 'Clear Filter',
        onClick: () => this.clearFilter()
      });

      buttons.push({
        key: 'clear-view',
        label: 'Clear View',
        onClick: () => this.clearTableUI()
      });

      return buttons;
    }
  },

  async mounted() {
    const token = localStorage.getItem('token');
    if (!token) {
      return this.$router.push('/login');
    }

    try {
      const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/check-auth`);
      if (!response.ok) {
        localStorage.removeItem('token');
        return this.$router.push('/login');
      }
    } catch {
      localStorage.removeItem('token');
      return this.$router.push('/login');
    }

    await Promise.all([
      this.fetchTable(),
      this.fetchProjectTypes(),
      this.fetchProjectStatuses()
    ]);
  },

  methods: {
    async fetchUserAccess() {
      this.isFetchingAccess = true;
      this.accessError = '';
      try {
        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-access`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not load user access.');
        this.accessRows = Array.isArray(result) ? result : [];
      } catch (err) {
        this.accessError = err.message || 'Could not load user access.';
      } finally {
        this.isFetchingAccess = false;
      }
    },

    async openAccessModal() {
      if (!this.isAdmin || this.isProcessing || this.isPageLoading) return;
      this.showAccessModal = true;
      this.accessSuccess = '';
      await this.fetchUserAccess();
    },

    async addUserAccess() {
      if (!this.isAdmin || this.isProcessing) return;
      this.accessError = '';
      this.accessSuccess = '';
      this.isProcessing = true;
      this.processingMessage = 'Adding user access...';
      try {
        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.accessForm)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not add user access.');
        this.accessForm = { username: '', access_right: 'user' };
        await this.fetchUserAccess();
        if (!this.accessError) this.accessSuccess = `${result.username} added as ${result.access_right}.`;
      } catch (err) {
        this.accessError = err.message || 'Could not add user access.';
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    async changeUserAccess(entry) {
      if (!this.isAdmin || this.isProcessing) return;
      const accessRight = entry.access_right === 'admin' ? 'user' : 'admin';
      if (entry.username.toLowerCase() === this.currentUsername.toLowerCase() && accessRight !== 'admin') return;
      if (accessRight === 'user' && !confirm(`Remove admin access for ${entry.username}?`)) return;

      this.accessError = '';
      this.accessSuccess = '';
      this.isProcessing = true;
      this.processingMessage = 'Updating user access...';
      try {
        const response = await this.apiFetch(
          `${process.env.VUE_APP_API_URL}/api/project-access/${encodeURIComponent(entry.username)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_right: accessRight })
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not update user access.');
        await this.fetchUserAccess();
        if (!this.accessError) this.accessSuccess = `${result.username} is now ${result.access_right}.`;
      } catch (err) {
        this.accessError = err.message || 'Could not update user access.';
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    // --- NEW: Restore Historical Record ---
    async restoreHistoricalRecord(log) {
      if (this.isProcessing || log.action_type === 'CURRENT') return;
      if (!this.isAdmin) return alert("Only administrators can restore records.");

      const confirmed = confirm(`Are you sure you want to revert to the values from ${log.changed_at}?`);
      if (!confirmed) return;

      this.isProcessing = true;
      this.processingMessage = 'Restoring record...';

      try {
        const payload = {
          project_code: log.project_code,
          project_name: log.project_name,
          project_type: log.project_type,
          project_status: log.project_status,
          use_case_investment: log.use_case_investment,
          project_description: log.project_description
        };

        const response = await this.apiFetch(`${this.apiBasePath}/${encodeURIComponent(log.project_code)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.message || 'Failed to restore record.');
        }

        this.successMessage = 'Record successfully reverted!';
        this.showSuccessDialog = true;

        // Fetch the fresh live table
        await this.fetchTable();

        // Refresh whichever modal is actively open so the user sees the new "Current" state
        if (this.showHistoryModal) {
          this.selectedRow = this.rows.find(r => r.project_code === log.project_code);
          await this.openHistoryModal();
        } else if (this.showGlobalHistoryModal) {
          await this.openGlobalHistoryModal();
        }

      } catch (err) {
        alert('Restore failed: ' + err.message);
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    // --- HISTORY MODALS ---
    async openGlobalHistoryModal() {
      this.showGlobalHistoryModal = true;
      this.isFetchingGlobalHistory = true;
      this.globalHistoryData = [];

      try {
        const response = await this.apiFetch(`${this.apiBasePath}/history/all`);
        if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(errData.message || `Backend Server returned ${response.status}`);
        }
        const historicalRecords = await response.json();

        // Only include projects that actually have an update history
        const projectsWithHistory = new Set(historicalRecords.map(log => log.project_code));

        const currentRecords = this.rows
          .filter(row => projectsWithHistory.has(row.project_code))
          .map(row => ({
            history_id: `current_${row.project_code}`,
            changed_at: 'Current Status',
            changed_by: 'Active Record',
            action_type: 'CURRENT',
            project_code: row.project_code,
            project_name: row.project_name,
            project_type: row.project_type,
            project_status: row.project_status,
            use_case_investment: row.use_case_investment,
            project_description: row.project_description
          }));

        // Sort: Group by Code -> Current on top -> History newest to oldest
        const combined = [...currentRecords, ...historicalRecords];
        combined.sort((a, b) => {
          if (a.project_code !== b.project_code) {
            return b.project_code.localeCompare(a.project_code);
          }
          if (a.action_type === 'CURRENT' && b.action_type !== 'CURRENT') return -1;
          if (b.action_type === 'CURRENT' && a.action_type !== 'CURRENT') return 1;
          return new Date(b.changed_at) - new Date(a.changed_at);
        });

        this.globalHistoryData = combined;
      } catch (err) {
        alert("Error loading global history: " + err.message);
        this.showGlobalHistoryModal = false;
      } finally {
        this.isFetchingGlobalHistory = false;
      }
    },

    globalRowClassFn(row) {
      return row.action_type === 'CURRENT' ? 'current-row-global' : '';
    },

    async openHistoryModal() {
      if (!this.selectedRow || !this.selectedRow.project_code) {
        return alert("Please select a project row first.");
      }

      this.showHistoryModal = true;
      this.isFetchingHistory = true;
      this.historyData = [];

      try {
        const response = await this.apiFetch(`${this.apiBasePath}/${encodeURIComponent(this.selectedRow.project_code)}/history`);
        if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(errData.message || `Backend Server returned ${response.status}`);
        }
        const historicalRecords = await response.json();

        const currentState = {
          history_id: 'current',
          changed_at: 'Current Status',
          changed_by: 'Active Record', 
          action_type: 'CURRENT',
          project_code: this.selectedRow.project_code,
          project_name: this.selectedRow.project_name,
          project_type: this.selectedRow.project_type,
          project_status: this.selectedRow.project_status,
          use_case_investment: this.selectedRow.use_case_investment,
          project_description: this.selectedRow.project_description
        };

        this.historyData = [currentState, ...historicalRecords];
      } catch (err) {
        alert("Error loading history: " + err.message);
        this.showHistoryModal = false;
      } finally {
        this.isFetchingHistory = false;
      }
    },

    // --- LOGIC METHODS ---
    generateNextProjectCode() {
      if (!this.rows || this.rows.length === 0) return 'PRJ-101'; 
      
      let maxNum = 0;
      this.rows.forEach(row => {
        if (row.project_code && typeof row.project_code === 'string') {
          const match = row.project_code.match(/^PRJ-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      });
      
      if (maxNum === 0) return 'PRJ-101'; 
      return `PRJ-${maxNum + 1}`;
    },

    formatCurrency(value) {
      if (value === null || value === undefined || value === '') return '';
      return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    startInlineEdit(row, field, currentValue) {
      if (this.isProcessing || this.isPageLoading) return;
      if (!this.isAdmin) return; 

      this.editingCell = { rowId: row.project_code, field };
      this.editValue = currentValue;
    },

    cancelInlineEdit() {
      this.editingCell = { rowId: null, field: null };
      this.editValue = null;
    },

    async saveInlineEdit(row) {
      if (this.isSavingInline) return;
      
      const field = this.editingCell.field;
      if (!field) return;

      let newValue = this.editValue;
      let oldValue = row[field];

      if (field === 'use_case_investment') {
        newValue = newValue === '' || newValue === null ? 0 : Number(newValue);
        oldValue = oldValue === '' || oldValue === null ? 0 : Number(oldValue);
      } else {
        newValue = String(newValue || '').trim();
        oldValue = String(oldValue || '').trim();
      }

      if (newValue === oldValue) {
        this.cancelInlineEdit();
        return;
      }

      if (field === 'project_name' && !newValue) {
        alert("Project Name cannot be empty.");
        this.cancelInlineEdit();
        return;
      }
      if (field === 'project_type' && !newValue) {
        alert("Project Type cannot be empty.");
        this.cancelInlineEdit();
        return;
      }
      if (field === 'project_status' && !newValue) {
        alert("Project Status cannot be empty.");
        this.cancelInlineEdit();
        return;
      }

      this.isSavingInline = true;
      this.isProcessing = true;
      this.processingMessage = 'Saving inline edit...';

      try {
        const payload = {
          project_code: row.project_code,
          project_name: field === 'project_name' ? newValue : row.project_name,
          project_type: field === 'project_type' ? newValue : row.project_type,
          project_status: field === 'project_status' ? newValue : row.project_status,
          use_case_investment: field === 'use_case_investment' ? newValue : (row.use_case_investment ?? 0),
          project_description: field === 'project_description' ? newValue : row.project_description
        };

        const response = await this.apiFetch(`${this.apiBasePath}/${encodeURIComponent(row.project_code)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to update row.');
        }

        await this.fetchTable();
      } catch (err) {
        alert('Update failed: ' + err.message);
      } finally {
        this.cancelInlineEdit();
        this.isSavingInline = false;
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },
    
    getColumnLabel(col) {
      const labelMap = {
        project_code: 'Project Code',
        project_name: 'Project Name',
        project_type: 'Project Type (Model Type)',
        project_status: 'Project Status',
        use_case_investment: 'Use Case Investment',
        project_description: 'Project Description'
      };
      return labelMap[col] || this.formatLabel(col);
    },

    formatLabel(col) {
      return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    emptyAddForm() {
      return {
        project_code: '',
        project_name: '',
        project_description: '',
        project_type: '',
        project_status: 'Active',
        use_case_investment: ''
      };
    },

    emptyUpdateForm() {
      return {
        original_project_code: '',
        project_code: '',
        project_name: '',
        project_description: '',
        project_type: '',
        project_status: '',
        use_case_investment: ''
      };
    },

    returnToTableView() {
      this.showAddForm = false;
      this.showUpdateForm = false;
      this.addForm = this.emptyAddForm();
      this.updateForm = this.emptyUpdateForm();
      this.addError = {};
      this.updateError = {};
    },

    async apiFetch(url, options = {}) {
      const token = localStorage.getItem('token');

      if (!options.headers) options.headers = {};
      options.headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(url, options);

      if (response.status === 401 || response.status === 403) {
        alert('Session expired. Please refresh the page and log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('access_right');
        this.$router.push('/login');
        throw new Error('Session expired');
      }

      return response;
    },

    logout() {
      if (this.isProcessing || this.isPageLoading) return;
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('access_right');
      this.$router.push('/login');
    },

    goHome() {
      if (this.isProcessing || this.isPageLoading) return;
      this.$router.push('/landing');
    },

    goBack() {
      if (this.isProcessing || this.isPageLoading) return;
      this.$router.push('/landing');
    },

    async fetchTable() {
      this.isPageLoading = true;

      try {
        const response = await this.apiFetch(this.apiBasePath);
        if (!response.ok) throw new Error('Failed to fetch project master data');

        const data = await response.json();

        this.rows = Array.isArray(data) ? data : [];
        this.filteredRows = [...this.rows];

        if (this.rows.length > 0) {
          this.columns = Object.keys(this.rows[0]);
        } else {
          const colRes = await this.apiFetch(`${this.apiBasePath}/columns`);
          if (!colRes.ok) throw new Error('Failed to fetch project master columns');

          const cols = await colRes.json();
          this.columns = Array.isArray(cols) ? cols : [];
        }
      } catch (err) {
        alert(err.message || 'Failed to fetch project master data');
      } finally {
        this.isPageLoading = false;
      }
    },

    async fetchProjectTypes() {
      try {
        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-types`);
        if (!response.ok) throw new Error('Failed to fetch project types');
        this.projectTypesOptions = await response.json(); 
      } catch (err) {
        console.error('Error fetching project types:', err);
        this.projectTypesOptions = [];
      }
    },

    async fetchProjectStatuses() {
      try {
        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-statuses`);
        if (!response.ok) throw new Error('Failed to fetch project statuses');
        this.projectStatusesOptions = await response.json(); 
      } catch (err) {
        console.error('Error fetching project statuses:', err);
        this.projectStatusesOptions = ['Pipeline', 'Active', 'Completed', 'On Hold', 'Cancelled']; 
      }
    },

    async handleExcelUpload(event) {
      if (!this.isAdmin) {
        this.excelResultMessage = 'You are not authorized to upload Excel.';
        this.showExcelResultDialog = true;
        if (event?.target) event.target.value = '';
        return;
      }

      if (this.isProcessing || this.isPageLoading) return;

      this.isProcessing = true;
      this.processingMessage = 'Uploading Excel, please wait...';

      const fileInput = event.target;
      const file = fileInput.files[0];

      if (!file) {
        this.processingMessage = '';
        this.isProcessing = false;
        return;
      }

      const lowerFileName = file.name.toLowerCase();
      if (!lowerFileName.endsWith('.xlsx') && !lowerFileName.endsWith('.xls')) {
        this.excelResultMessage = 'Please upload an Excel (.xlsx or .xls) file.';
        this.showExcelResultDialog = true;
        fileInput.value = '';
        this.processingMessage = '';
        this.isProcessing = false;
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await this.apiFetch(`${this.apiBasePath}/upload-excel`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Excel upload failed.');
        }

        this.excelResultMessage = result.message || 'Project master Excel upload completed.';
        this.showExcelResultDialog = true;
        await this.fetchTable();
      } catch (err) {
        this.excelResultMessage = err.message || 'Excel upload failed.';
        this.showExcelResultDialog = true;
      } finally {
        fileInput.value = '';
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    openAddForm() {
      if (this.isProcessing || this.isPageLoading) return;
      this.addForm = this.emptyAddForm();
      this.addForm.project_code = this.generateNextProjectCode(); 
      this.formError = '';
      this.showAddForm = true;
      this.showUpdateForm = false;
    },

    closeAddForm() {
      if (this.isProcessing) return;
      this.returnToTableView();
    },

    closeAddTypeForm() {
      if (this.isProcessing) return;
      this.showAddTypeForm = false;
      this.addTypeForm.type_name = '';
      this.addTypeError = '';
    },

    validateForm(form) {
      if (!form.project_code || !String(form.project_code).trim()) {
        return 'Project Code is required.';
      }
      if (!form.project_name || !String(form.project_name).trim()) {
        return 'Project Name is required.';
      }
      if (!form.project_type || !String(form.project_type).trim()) {
        return 'Project Type is required.';
      }
      if (!form.project_status || !String(form.project_status).trim()) {
        return 'Project Status is required.';
      }
      if (
        form.use_case_investment !== '' &&
        form.use_case_investment !== null &&
        form.use_case_investment !== undefined &&
        Number.isNaN(Number(form.use_case_investment))
      ) {
        return 'Use Case Investment must be a number.';
      }

      return '';
    },

    normalizePayload(form) {
      return {
        project_code: form.project_code ? String(form.project_code).trim() : null,
        project_name: form.project_name ? String(form.project_name).trim() : null,
        project_description: form.project_description ? String(form.project_description).trim() : null,
        project_type: form.project_type ? String(form.project_type).trim() : null,
        project_status: form.project_status ? String(form.project_status).trim() : null,
        use_case_investment:
          form.use_case_investment === '' || form.use_case_investment === null || form.use_case_investment === undefined
            ? 0
            : Number(form.use_case_investment)
      };
    },

    async submitAddForm() {
      if (!this.isAdmin) {
        this.addError.general = 'You are not authorized to add projects.';
        return;
      }

      if (this.isProcessing) return;

      const validationError = this.validateForm(this.addForm);
      if (validationError) {
        this.addError.general = validationError;
        return;
      }

      this.isProcessing = true;
      this.processingMessage = 'Adding project, please wait...';
      this.addError = {};

      try {
        const payload = this.normalizePayload(this.addForm);

        const response = await this.apiFetch(this.apiBasePath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to add project.');
        }

        this.returnToTableView();
        await this.fetchTable();
        this.selectedRow = null;
        this.successMessage = 'Project added successfully!';
        this.showSuccessDialog = true;
      } catch (err) {
        this.addError.general = err.message;
      } finally {
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    async submitAddTypeForm() {
      if (!this.isAdmin) {
        this.addTypeError = 'You are not authorized to add project types.';
        return;
      }

      if (!this.addTypeForm.type_name || !String(this.addTypeForm.type_name).trim()) {
        this.addTypeError = 'Project Type Name is required.';
        return;
      }

      if (this.isProcessing) return;
      this.isProcessing = true;
      this.processingMessage = 'Adding project type, please wait...';
      this.addTypeError = '';

      try {
        const payload = { type_name: this.addTypeForm.type_name.trim() };

        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-types`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to add project type.');
        }

        this.closeAddTypeForm();
        await this.fetchProjectTypes(); 
        this.successMessage = 'Project Type added successfully!';
        this.showSuccessDialog = true;
      } catch (err) {
        this.addTypeError = err.message;
      } finally {
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    openUpdateForm() {
      if (!this.isAdmin) {
        return alert('You are not authorized to update projects.');
      }

      if (this.isProcessing || this.isPageLoading) return;
      if (!this.selectedRow) {
        return alert('Please select a row to update.');
      }

      this.updateForm = {
        original_project_code: this.selectedRow.project_code || '',
        project_code: this.selectedRow.project_code || '',
        project_name: this.selectedRow.project_name || '',
        project_description: this.selectedRow.project_description || '',
        project_type: this.selectedRow.project_type || '',
        project_status: this.selectedRow.project_status || 'Active',
        use_case_investment: this.selectedRow.use_case_investment ?? ''
      };

      this.updateError = {};
      this.showUpdateForm = true;
    },

    closeUpdateForm() {
      if (this.isProcessing) return;
      this.returnToTableView();
    },

    async submitUpdateForm() {
      if (!this.isAdmin) {
        this.updateError.general = 'You are not authorized to update projects.';
        return;
      }

      if (this.isProcessing) return;

      const validationError = this.validateForm(this.updateForm);
      if (validationError) {
        this.updateError.general = validationError;
        return;
      }

      this.isProcessing = true;
      this.processingMessage = 'Updating project, please wait...';
      this.updateError = {};

      try {
        const payload = this.normalizePayload(this.updateForm);

        const response = await this.apiFetch(
          `${this.apiBasePath}/${encodeURIComponent(this.updateForm.original_project_code)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to update project.');
        }

        this.returnToTableView();
        await this.fetchTable();
        this.selectedRow = null;
        this.successMessage = 'Project updated successfully!';
        this.showSuccessDialog = true;
      } catch (err) {
        this.updateError.general = err.message;
      } finally {
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    closeSearchModal() {
      if (this.isProcessing) return;
      this.openSearchForm = false;
    },

    applyColumnFilters() {
      if (this.isProcessing) return;

      this.filteredRows = this.rows.filter(row =>
        Object.entries(this.columnFilters).every(([field, value]) => {
          if (!value) return true;
          return String(row[field] ?? '').toLowerCase().includes(String(value).toLowerCase());
        })
      );

      this.openSearchForm = false;
    },

    resetFilters() {
      if (this.isProcessing) return;
      this.columnFilters = {};
      this.filteredRows = [...this.rows];
    },

    clearFilter() {
      if (this.isProcessing || this.isPageLoading) return;
      this.columnFilters = {};
      this.filteredRows = [...this.rows];
      this.selectedRow = null;
    },

    clearTableUI() {
      if (this.isProcessing || this.isPageLoading) return;
      this.rows = [];
      this.filteredRows = [];
      this.selectedRow = null;
    },

    selectRow({ row }) {
      if (this.isProcessing || this.isPageLoading) return;
      this.selectedRow = row;
    },

    rowClassFn(row) {
      return this.selectedRow && this.selectedRow.project_code === row.project_code ? 'selected' : '';
    }
  }
};
</script>

<style scoped>
.access-modal > p {
  color: #495057;
  margin: 8px 0 20px;
}

.access-form {
  display: flex;
  align-items: end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.access-form .form-group {
  flex: 1 1 200px;
}

.access-form button {
  margin-bottom: 1px;
}

.access-table-container {
  max-height: 320px;
}

.access-loading {
  padding: 16px;
  color: #495057;
}

.access-success {
  color: #155724;
  font-weight: 600;
}

/* X-Large Modal for Global Audit Log */
.x-large-modal {
  width: 95%;
  max-width: 1400px;
}

/* Status Badges */
.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  display: inline-block;
  background-color: #e9ecef;
  color: #495057;
}

.status-badge.active { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
.status-badge.completed { background-color: #cce5ff; color: #004085; border: 1px solid #b8daff; }
.status-badge.pipeline { background-color: #fff3cd; color: #004085; border: 1px solid #b8daff; }
.status-badge.on-hold { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
.status-badge.cancelled { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }

/* History Table CSS */
.history-table-container {
  max-height: 400px;
  overflow-y: auto;
  margin-top: 16px;
  border: 1px solid #e0e6ed;
  border-radius: 8px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
}

.history-table th, .history-table td {
  border-bottom: 1px solid #e0e6ed;
  padding: 10px 14px;
  text-align: left;
  font-size: 0.95rem;
}

.history-table th {
  background-color: #f8f9fb;
  color: #07254a;
  font-weight: 600;
  position: sticky;
  top: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.badge {
  background-color: #e7edf5;
  color: #1f5fa8;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: bold;
}

/* Styles for the "Current" top row */
.current-row {
  background-color: #f0fdf4;
}

.current-row td {
  border-bottom: 2px solid #28a745;
}

/* Styles required to make vue-good-table render the green highlight */
:deep(.current-row-global) {
  background-color: #f0fdf4 !important;
}

:deep(.current-row-global td) {
  border-bottom: 2px solid #28a745 !important;
  border-top: 4px solid #c2c9d1 !important; 
}

.badge-current {
  background-color: #28a745;
  color: white;
}

/* Restore Button Styles */
.restore-btn {
  background-color: #f8f9fb;
  color: #1f5fa8;
  border: 1px solid #1f5fa8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.restore-btn:hover {
  background-color: #1f5fa8;
  color: #fff;
}

.history-desc {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Inline Edit CSS */
.inline-edit-hint {
  background-color: #e7edf5;
  color: #1f5fa8;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.95rem;
}

.editable-cell {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.2s, background-color 0.2s;
  display: inline-block;
  min-width: 50px;
  min-height: 20px;
}

.editable-cell:hover {
  border-bottom: 1px dashed #1f5fa8;
  background-color: #f0f4f8;
}

.inline-input {
  padding: 4px;
  border: 1px solid #1f5fa8;
  border-radius: 4px;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  box-sizing: border-box;
}

/* Original CSS Below */
:deep(.wrap-text-cell) {
  white-space: normal !important;
  word-wrap: break-word !important;
  line-height: 1.5;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.home-btn,
.logout-btn,
.back-btn {
  background: none;
  color: #fff;
  border: 2px solid #fff;
  font-size: 1.1rem;
  cursor: pointer;
  font-weight: 500;
  border-radius: 8px;
  padding: 8px 24px;
  transition: background 0.2s, color 0.2s, border 0.2s;
}

.home-btn:hover,
.logout-btn:hover,
.back-btn:hover {
  background: #ffd600;
  color: #07254a;
  border-color: #ffd600;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
}

.large-modal {
  width: 90%;
  max-width: 1000px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(250px, 1fr));
  gap: 16px;
}

.full-width {
  grid-column: 1 / -1;
}

.audit-panel {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid #d9d9d9;
  border-radius: 10px;
  background: #f8f9fb;
}

.audit-panel h4 {
  margin-bottom: 12px;
  color: #1f3b64;
}

.audit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 10px 20px;
}

.full-width-audit {
  grid-column: 1 / -1;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-box {
  text-align: center;
  background: #fff;
  padding: 24px 32px;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  min-width: 380px;
}

.spinner {
  width: 42px;
  height: 42px;
  border: 4px solid #ddd;
  border-top: 4px solid #1f5fa8;
  border-radius: 50%;
  margin: 0 auto 12px;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-weight: 600;
  color: #333;
}

.loading-subtext {
  margin-top: 8px;
  font-size: 0.92rem;
  color: #666;
}

.loading-bar-wrapper {
  width: 320px;
  height: 12px;
  background: #e7edf5;
  border-radius: 999px;
  overflow: hidden;
  margin: 16px auto 0;
  position: relative;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

.loading-bar-indeterminate {
  width: 40%;
  height: 100%;
  position: absolute;
  left: -40%;
  top: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #1f5fa8, #4da3ff, #1f5fa8);
  animation: loading-bar-slide 1.15s ease-in-out infinite;
}

.upload-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 16px 0;
}

.uploadExport-label {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.upload-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #28a745;
  color: #fff;
  border: 1px solid #28a745;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s, border-color 0.2s, transform 0.1s;
}

.upload-icon:hover {
  background: #218838;
  border-color: #218838;
}

.upload-icon:active {
  transform: translateY(1px);
}

.icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes loading-bar-slide {
  0% {
    left: -40%;
  }
  100% {
    left: 100%;
  }
}
</style>
