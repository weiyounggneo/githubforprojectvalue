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

    <!-- TOP NAVIGATION BAR (Excluded from PDF) -->
    <header class="top-bar">
      <div class="left">
        <img src="@/assets/st-logo.png" alt="ST Logo" class="logo" />
        <span class="title">
          Project Value Calculation <br />
          {{ activeTabTitle }}
        </span>
      </div>

      <div class="topbar-actions">
        <button class="pdf-btn" @click="exportPDF" :disabled="isProcessing || isPageLoading || isDatabricksBusy || isCombinedBusy">Export PDF</button>
        <button class="home-btn" @click="goHome" :disabled="isProcessing || isPageLoading">Home</button>
        <button class="spotfire-btn" @click="openSpotfire" :disabled="isProcessing || isPageLoading">Spotfire</button>
        <button class="logout-btn" @click="logout" :disabled="isProcessing || isPageLoading">Logout</button>
      </div>
    </header>

    <!-- WRAPPER FOR PDF EXPORT -->
    <div ref="pdfExportArea" class="pdf-export-container">
      

      <div class="upload-section" v-if="activeTab === 'grid'">
        <label
          class="uploadExport-label"
          :style="{ pointerEvents: isProcessing || isPageLoading ? 'none' : 'auto', opacity: isProcessing || isPageLoading ? 0.6 : 1 }"
        >
          <input type="file" accept=".xlsx,.xls" @change="handleExcelImport" style="display: none;" />
          <span class="upload-icon" title="Import Excel">
            <img src="@/assets/excel.png" alt="Upload" class="icon-img" />
            <span style="margin-left: 6px;">Import Excel</span>
          </span>
        </label>

        <button class="export-btn" @click="exportData" :disabled="isProcessing || isPageLoading">
          <img src="@/assets/export.png" title="Export Excel" alt="Export Excel" class="icon-img" />
          Export Excel
        </button>
      </div>

      <!-- DASHBOARD QUICK FILTERS -->
      <div class="quick-filters-container" v-if="rows.length > 0 && (activeTab === 'grid' || activeTab === 'charts')">
        <div class="quick-filter-group">
          <label for="filter-project-name">Filter by Project Name:</label>
          <select 
            id="filter-project-name" 
            v-model="columnFilters.project_name" 
            @change="applyColumnFilters"
            :disabled="isProcessing || isPageLoading"
          >
            <option value="">All Projects</option>
            <option v-for="name in uniqueProjectNames" :key="name" :value="name">
              {{ name }}
            </option>
          </select>
        </div>

        <div class="quick-filter-group">
          <label for="filter-project-type">Filter by Project Type:</label>
          <select 
            id="filter-project-type" 
            v-model="columnFilters.project_type" 
            @change="applyColumnFilters"
            :disabled="isProcessing || isPageLoading"
          >
            <option value="">All Types</option>
            <option v-for="type in uniqueProjectTypes" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
        </div>

        <!-- KPI Display Filter: Only visible on the Cumulative Analytics page -->
        <div class="quick-filter-group" v-if="activeTab === 'charts'">
          <label>Filter KPI Types:</label>
          <div class="checkbox-group">
            <label><input type="checkbox" value="capacity" v-model="selectedKPIs"> Capacity</label>
            <label><input type="checkbox" value="yield" v-model="selectedKPIs"> Yield</label>
            <label><input type="checkbox" value="productivity" v-model="selectedKPIs"> People</label>
            <label><input type="checkbox" value="quality" v-model="selectedKPIs"> Quality</label>
          </div>
        </div>
      </div>

      <!-- KPI SUMMARY CARDS -->
      <div class="kpi-summary-container" v-if="rows.length > 0 && (activeTab === 'grid' || activeTab === 'charts')">
        <div class="metric-card bg-kpi-1" v-if="selectedKPIs.includes('capacity')">
          <h4>Capacity Improvement</h4>
          <div class="metric-content">
            <span class="metric-value">{{ formatCurrency(kpiTotals.capacity) }}</span>
          </div>
        </div>
        <div class="metric-card bg-kpi-2" v-if="selectedKPIs.includes('yield')">
          <h4>Yield Savings</h4>
          <div class="metric-content">
            <span class="metric-value">{{ formatCurrency(kpiTotals.yield) }}</span>
          </div>
        </div>
        <div class="metric-card bg-kpi-3" v-if="selectedKPIs.includes('productivity')">
          <h4>People Productivity</h4>
          <div class="metric-content">
            <span class="metric-value">{{ formatCurrency(kpiTotals.productivity) }}</span>
          </div>
        </div>
        <div class="metric-card bg-kpi-4" v-if="selectedKPIs.includes('quality')">
          <h4>Quality Improvement</h4>
          <div class="metric-content">
            <span class="metric-value">{{ formatCurrency(kpiTotals.quality) }}</span>
          </div>
        </div>
      </div>

      <!-- TAB NAVIGATION -->
      <div class="tabs-container">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'grid' }" 
          @click="activeTab = 'grid'"
        >
          On Prem Values
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'charts' }" 
          @click="activeTab = 'charts'"
        >
          On Prem Analytics
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'unit-cost' }"
          @click="activeTab = 'unit-cost'"
        >
          Unit Cost Savings
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'cloud-values' }"
          :disabled="isProcessing || isPageLoading || isCombinedBusy"
          @click="activeTab = 'cloud-values'"
        >
          Databricks Values
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'combined-values' }"
          :disabled="isProcessing || isPageLoading || isDatabricksBusy"
          @click="activeTab = 'combined-values'"
        >
          Combined Values
        </button>
      </div>

      <!-- TAB 1: ON PREM VALUES -->
      <div v-show="activeTab === 'grid'">
        <div class="table-section" v-if="goodTableColumns.length > 0">
          <div class="inline-edit-hint">
            💡 <strong>Tip:</strong> Double-click any KPI metric (Capacity, Yield, People, Quality) in the table to edit it directly.
          </div>

          <vue-good-table
            :columns="goodTableColumns"
            :rows="filteredRows"
            :pagination-options="{ enabled: true, perPage: 10 }"
            :line-numbers="true"
            @row-click="selectRow"
            :rowStyleClass="rowClassFn"
          >
            <!-- UPDATED: Inline Editing block elements -->
            <template #table-row="props">
              <span v-if="['capacity_improvement', 'yield_savings', 'people_productivity', 'quality_improvement'].includes(props.column.field)">
                
                <div v-if="editingCell.rowId === props.row.metric_id && editingCell.field === props.column.field" style="width: 100%;">
                  <input
                    type="number"
                    step="any"
                    v-model="editValue"
                    @blur="saveInlineEdit(props.row)"
                    @keyup.enter="saveInlineEdit(props.row)"
                    @keyup.esc="cancelInlineEdit"
                    v-focus
                    class="inline-input"
                  />
                </div>
                
                <div 
                  v-else 
                  @dblclick.stop="startInlineEdit(props.row, props.column.field, props.row[props.column.field])" 
                  class="editable-cell" 
                  title="Double-click to edit"
                >
                  {{ props.formattedRow[props.column.field] }}
                </div>
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

        <div class="actions">
          <button @click="openAddForm" :disabled="isProcessing || isPageLoading">Add</button>
          <button @click="openUpdateForm" :disabled="isProcessing || isPageLoading || !selectedRow">Update</button>
          <button @click="openHistoryModal" :disabled="isProcessing || isPageLoading || !selectedRow">View History</button>
          <button v-if="isAdmin" @click="openGlobalHistoryModal" :disabled="isProcessing || isPageLoading">Global Audit Log</button>
          <button @click="openSearchForm = true" :disabled="isProcessing || isPageLoading">Search</button>
          <button @click="clearFilter" :disabled="isProcessing || isPageLoading">Clear Filter</button>
          <button @click="clearTableUI" :disabled="isProcessing || isPageLoading">Clear View</button>
        </div>

        <div v-if="selectedRow" class="audit-panel">
          <h4>Selected Row Information</h4>
          <div class="audit-grid">
            <div><strong>Metric ID:</strong> {{ selectedRow.metric_id || '-' }}</div>
            <div><strong>Project Code:</strong> {{ selectedRow.project_code || '-' }}</div>
            <div><strong>Project Name:</strong> {{ selectedRow.project_name || '-' }}</div>
            <div><strong>Project Type:</strong> {{ selectedRow.project_type || '-' }}</div>
            <div><strong>Use Case Investment:</strong> {{ selectedRow.use_case_investment ?? '-' }}</div>
          </div>
        </div>
      </div>

      <!-- TAB 2: CUMULATIVE CHARTS (Dynamic Scaling Grid) -->
      <div v-if="activeTab === 'charts'" class="charts-section">
        <h3 class="chart-title">Cumulative Project Values Over Time</h3>
        <p class="chart-subtitle">Displays the independent running sum for each KPI based on active filters.</p>
        
        <div v-if="selectedKPIs.length === 0" style="text-align: center; padding: 40px; color: #666; font-size: 1.1rem;">
          No KPIs selected. Please check at least one KPI type above.
        </div>

        <!-- Portfolio Cumulative Stacked Bar Chart -->
        <div class="chart-card" style="margin-bottom: 24px;" v-if="selectedKPIs.length > 0">
          <apexchart type="line" height="450" :options="stackedBarChartData.options" :series="stackedBarChartData.series"></apexchart>
        </div>

        <!-- Metric-Specific Line Charts -->
        <div class="charts-grid" :class="gridLayoutClass" v-if="selectedKPIs.length > 0">
          <div class="chart-card" v-if="selectedKPIs.includes('capacity')">
            <apexchart type="line" height="350" :options="chartData.capacity.options" :series="chartData.capacity.series"></apexchart>
          </div>
          <div class="chart-card" v-if="selectedKPIs.includes('yield')">
            <apexchart type="line" height="350" :options="chartData.yield.options" :series="chartData.yield.series"></apexchart>
          </div>
          <div class="chart-card" v-if="selectedKPIs.includes('productivity')">
            <apexchart type="line" height="350" :options="chartData.productivity.options" :series="chartData.productivity.series"></apexchart>
          </div>
          <div class="chart-card" v-if="selectedKPIs.includes('quality')">
            <apexchart type="line" height="350" :options="chartData.quality.options" :series="chartData.quality.series"></apexchart>
          </div>
        </div>

      </div>

      <!-- TAB 3: UNIT COST SAVINGS -->
      <section v-if="activeTab === 'unit-cost'" class="unit-cost-section">
        <h3 class="chart-title">Unit Cost Savings</h3>
        <p class="chart-subtitle">
          Shows the average cost per unit for projects with a unit cost record.
          A lower rate is a reduction per unit; total savings need a unit volume or baseline.
          Signed-in users can edit rates; admins can delete them.
        </p>

        <div class="unit-cost-entry">
          <h4>Add an average unit cost</h4>
          <p>Select a project from Project Master, then enter the date its rate takes effect.</p>
          <div v-if="isLoadingProjectOptions" class="unit-cost-message">Loading projects...</div>
          <div v-else-if="!projectOptions.length" class="unit-cost-message unit-cost-error">
            Project Master options are unavailable.
            <button type="button" class="restore-btn" @click="fetchProjectOptions">Retry</button>
          </div>
          <form v-else class="unit-cost-entry-form" @submit.prevent="submitUnitCostRate">
            <label for="new-unit-cost-project">
              Project
              <select id="new-unit-cost-project" v-model="unitCostForm.project_code"
                :disabled="isProcessing || isLoadingUnitCosts" required>
                <option value="">Select a project</option>
                <option v-for="project in projectOptions" :key="project.project_code" :value="project.project_code">
                  {{ project.project_name }} ({{ project.project_code }})
                </option>
              </select>
            </label>
            <label for="new-unit-cost-date">
              Effective date
              <input id="new-unit-cost-date" type="date" v-model="unitCostForm.effective_date"
                :disabled="isProcessing || isLoadingUnitCosts" required />
            </label>
            <label for="new-unit-cost-value">
              Average cost per unit
              <input id="new-unit-cost-value" type="number" min="0" step="0.0001"
                v-model="unitCostForm.avg_unit_cost" placeholder="e.g. 1.2733"
                :disabled="isProcessing || isLoadingUnitCosts" required />
            </label>
            <button type="submit" class="actions formButton" :disabled="isProcessing || isLoadingUnitCosts">
              {{ isProcessing ? 'Saving...' : 'Add Rate' }}
            </button>
          </form>
          <p v-if="unitCostSaveError" class="unit-cost-error" role="alert">{{ unitCostSaveError }}</p>
          <p v-if="unitCostSaveMessage" class="unit-cost-success" role="status">{{ unitCostSaveMessage }}</p>
        </div>

        <div v-if="isLoadingUnitCosts" class="unit-cost-message">Loading unit costs...</div>
        <div v-else-if="unitCostError" class="unit-cost-message unit-cost-error" role="alert">
          {{ unitCostError }}
          <button type="button" class="restore-btn" @click="fetchUnitCosts">Retry</button>
        </div>
        <div v-else-if="!unitCostProjectSummaries.length" class="unit-cost-message">
          No unit cost records are available yet.
        </div>

        <template v-else>
          <div class="unit-cost-topline">
            <div class="unit-cost-count">
              <strong>{{ unitCostProjectSummaries.length }}</strong>
              <span>projects with unit cost data</span>
            </div>
            <label class="unit-cost-picker" for="unit-cost-project">
              Project
              <select id="unit-cost-project" v-model="selectedUnitCostProjectCode">
                <option v-for="project in unitCostProjectSummaries"
                  :key="project.project_code" :value="project.project_code">
                  {{ project.project_name }} ({{ project.project_code }})
                </option>
              </select>
            </label>
          </div>

          <div v-if="unitCostLatest" class="unit-cost-detail">
            <h4>{{ selectedUnitCostProjectName }} <span>({{ selectedUnitCostProjectCode }})</span></h4>
            <div class="unit-cost-cards">
              <div class="unit-cost-card">
                <span>Latest average unit cost</span>
                <strong>{{ formatUnitCost(unitCostLatest.avg_unit_cost) }}</strong>
                <small>Effective {{ unitCostLatest.effective_date }}</small>
              </div>
              <div class="unit-cost-card">
                <span>Previous average unit cost</span>
                <strong>{{ unitCostPrevious ? formatUnitCost(unitCostPrevious.avg_unit_cost) : '—' }}</strong>
                <small>{{ unitCostPrevious ? 'Effective ' + unitCostPrevious.effective_date : 'No earlier rate' }}</small>
              </div>
              <div class="unit-cost-card" :class="{ 'unit-cost-reduction': unitCostChange > 0, 'unit-cost-increase': unitCostChange < 0 }">
                <span>{{ unitCostChangeLabel }}</span>
                <strong>{{ unitCostChange === null ? '—' : formatUnitCost(Math.abs(unitCostChange)) }}</strong>
                <small>{{ unitCostChangePercent === null ? 'Compared with the previous rate' : formatPercent(unitCostChangePercent) + ' compared with the previous rate' }}</small>
              </div>
            </div>

            <div class="chart-card unit-cost-chart" v-if="unitCostSelectedRows.length > 1">
              <apexchart type="line" height="340" :options="unitCostChartData.options" :series="unitCostChartData.series"></apexchart>
            </div>
            <p v-else class="unit-cost-message">Add another effective rate to see a trend and a per-unit change.</p>

            <h4>Rate history</h4>
            <div class="unit-cost-table-wrap">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Effective date</th><th>Average unit cost</th>
                    <th>Created by</th><th>Created date</th>
                    <th>Updated by</th><th>Updated date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(rate, index) in [...unitCostSelectedRows].reverse()" :key="rate.effective_date + '-' + index">
                    <td>{{ rate.effective_date }}</td>
                    <td>{{ formatUnitCost(rate.avg_unit_cost) }}</td>
                    <td>{{ rate.created_by || '—' }}</td>
                    <td>{{ rate.created_date || '—' }}</td>
                    <td>{{ rate.updated_by || '—' }}</td>
                    <td>{{ rate.updated_date || '—' }}</td>
                    <td class="unit-cost-row-actions">
                      <button type="button" class="restore-btn" :disabled="isProcessing"
                        @click="openUnitCostEdit(rate)">Edit</button>
                      <button v-if="isAdmin" type="button" class="unit-cost-delete-btn" :disabled="isProcessing"
                        @click="deleteUnitCostRate(rate)">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h4 class="unit-cost-list-title">Latest rate by project</h4>
          <div class="unit-cost-table-wrap">
            <table class="history-table">
              <thead>
                <tr><th>Project</th><th>Latest effective date</th><th>Average unit cost</th><th>Change vs previous</th></tr>
              </thead>
              <tbody>
                <tr v-for="project in unitCostProjectSummaries" :key="project.project_code"
                  :class="{ 'unit-cost-selected-row': project.project_code === selectedUnitCostProjectCode }">
                  <td>
                    <button type="button" class="unit-cost-project-link"
                      @click="selectedUnitCostProjectCode = project.project_code">
                      {{ project.project_name }} ({{ project.project_code }})
                    </button>
                  </td>
                  <td>{{ project.latest.effective_date }}</td>
                  <td>{{ formatUnitCost(project.latest.avg_unit_cost) }}</td>
                  <td>{{ project.change === null ? 'No previous rate' : (project.change > 0 ? 'Down ' : project.change < 0 ? 'Up ' : 'No change ') + formatUnitCost(Math.abs(project.change)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <!-- TAB 4: DATABRICKS PROJECT VALUES -->
      <databricks-project-values
        v-if="activeTab === 'cloud-values'"
        :api-fetch="apiFetch"
        :endpoint="databricksApiBasePath"
        @busy-change="isDatabricksBusy = $event"
      />

      <combined-project-values
        v-if="activeTab === 'combined-values'"
        :api-fetch="apiFetch"
        :databricks-endpoint="databricksApiBasePath"
        @busy-change="isCombinedBusy = $event"
      />

    </div> <!-- End of PDF Export Wrapper -->

    <!-- Edit one unit cost rate; the project identity stays fixed. -->
    <div v-if="showUnitCostEditModal" class="modal-overlay">
      <div class="modal unit-cost-edit-modal">
        <h3>Edit Unit Cost Rate</h3>
        <form @submit.prevent="submitUnitCostEdit">
          <div class="form-group">
            <label>Project</label>
            <input :value="unitCostEditProjectName + ' (' + unitCostEditForm.project_code + ')'" disabled />
          </div>
          <div class="form-group">
            <label for="edit-unit-cost-date">Effective date</label>
            <input id="edit-unit-cost-date" type="date" v-model="unitCostEditForm.effective_date"
              :disabled="isProcessing" required />
          </div>
          <div class="form-group">
            <label for="edit-unit-cost-value">Average cost per unit</label>
            <input id="edit-unit-cost-value" type="number" min="0" step="0.0001"
              v-model="unitCostEditForm.avg_unit_cost" :disabled="isProcessing" required />
          </div>
          <div v-if="unitCostEditError" class="form-error" role="alert">{{ unitCostEditError }}</div>
          <div class="modal-actions">
            <button type="submit" class="actions formButton" :disabled="isProcessing">Save Changes</button>
            <button type="button" class="actions cancel" :disabled="isProcessing"
              @click="closeUnitCostEdit">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Add / Update Modal -->
    <div v-if="showAddForm || showUpdateForm" class="modal-overlay">
      <div class="modal large-modal">
        <h3>{{ showAddForm ? 'Add Project Value Row' : 'Update Project Value Row' }}</h3>

        <form @submit.prevent="showAddForm ? submitAddForm() : submitUpdateForm()">
          <div class="form-grid">
            <div class="form-group">
              <label for="project_name">Project Name</label>
              <select
                id="project_name"
                v-model="activeForm.project_name"
                :disabled="isFieldDisabled('project_name')"
                @change="handleProjectSelection"
              >
                <option value="">Please Select</option>
                <option
                  v-for="project in projectOptions"
                  :key="project.project_code"
                  :value="project.project_name"
                >
                  {{ project.project_name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="month_end">Month End</label>
              <input
                id="month_end"
                type="date"
                v-model="activeForm.month_end"
                :disabled="isFieldDisabled('month_end')"
                @change="snapToLastDayOfMonth"
              />
            </div>

            <div class="form-group">
              <label for="capacity_improvement">Capacity Improvement</label>
              <input
                id="capacity_improvement"
                type="number"
                step="any"
                v-model="activeForm.capacity_improvement"
                :disabled="isFieldDisabled('capacity_improvement')"
              />
            </div>

            <div class="form-group">
              <label for="yield_savings">Yield Savings</label>
              <input
                id="yield_savings"
                type="number"
                step="any"
                v-model="activeForm.yield_savings"
                :disabled="isFieldDisabled('yield_savings')"
              />
            </div>

            <div class="form-group">
              <label for="people_productivity">People Productivity</label>
              <input
                id="people_productivity"
                type="number"
                step="any"
                v-model="activeForm.people_productivity"
                :disabled="isFieldDisabled('people_productivity')"
              />
            </div>

            <div class="form-group">
              <label for="quality_improvement">Quality Improvement</label>
              <input
                id="quality_improvement"
                type="number"
                step="any"
                v-model="activeForm.quality_improvement"
                :disabled="isFieldDisabled('quality_improvement')"
              />
            </div>

            <div class="form-group">
              <label>Project Code</label>
              <input :value="selectedProjectMeta.project_code || ''" disabled />
            </div>

            <div class="form-group">
              <label>Project Type (Model Type)</label>
              <input :value="selectedProjectMeta.project_type || ''" disabled />
            </div>

            <div class="form-group">
              <label>Use Case Investment</label>
              <input :value="selectedProjectMeta.use_case_investment ?? ''" disabled />
            </div>

            <div class="form-group full-width">
              <label>Project Description</label>
              <textarea :value="selectedProjectMeta.project_description || ''" rows="4" disabled></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button type="submit" class="actions formButton" :disabled="isProcessing">
              {{ isProcessing ? (showAddForm ? 'Adding...' : 'Updating...') : (showAddForm ? 'Add' : 'Update') }}
            </button>
            <button type="button" class="actions cancel" @click="closeForm" :disabled="isProcessing">Cancel</button>
          </div>

          <div v-if="formError" class="form-error">{{ formError }}</div>
        </form>
      </div>
    </div>

    <!-- Row-Level History Modal -->
    <div v-if="showHistoryModal" class="modal-overlay">
      <div class="modal large-modal">
        <h3>Version History: {{ selectedRow?.project_name }} ({{ selectedRow?.month_end }})</h3>
        
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
                <th>Status</th>
                <th>Capacity Impr.</th>
                <th>Yield Savings</th>
                <th>People Prod.</th>
                <th>Quality Impr.</th>
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
                    <button 
                      v-if="log.action_type !== 'CURRENT'" 
                      class="restore-btn" 
                      @click="restoreHistoricalRecord(log)"
                      title="Revert live record to this version"
                    >
                      Restore
                    </button>
                  </div>
                </td>
                <td>{{ formatCurrency(log.capacity_improvement) }}</td>
                <td>{{ formatCurrency(log.yield_savings) }}</td>
                <td>{{ formatCurrency(log.people_productivity) }}</td>
                <td>{{ formatCurrency(log.quality_improvement) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="historyData.length === 1" style="text-align: center; padding: 16px; color: #666; font-size: 0.9rem;">
            No previous edits found for this record. The current version is the original.
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
        <h3>Global Audit Log: Project Values</h3>
        
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
                  <button 
                    v-if="props.row.action_type !== 'CURRENT'" 
                    class="restore-btn" 
                    @click="restoreHistoricalRecord(props.row)"
                    title="Revert live record to this version"
                  >
                    Restore
                  </button>
                </div>
              </span>
              <span v-else-if="['capacity_improvement', 'yield_savings', 'people_productivity', 'quality_improvement'].includes(props.column.field)">
                {{ formatCurrency(props.row[props.column.field]) }}
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

    <!-- Search Modal -->
    <div v-if="openSearchForm" class="modal-overlay">
      <div class="modal">
        <h3>Search Project Value Table</h3>
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
            <button type="button" class="actions cancel" @click="openSearchForm = false" :disabled="isProcessing">Close</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Overwrite Confirmation Modal -->
    <div v-if="showOverwriteModal" class="modal-overlay">
      <div class="confirmationmessage">
        <h3 style="color: #d93025; margin-top: 0; border-bottom: none;">⚠️ Duplicate Data Detected</h3>
        <p style="margin-bottom: 12px;">This Excel file contains data for month ending dates that already exist in the system for these projects.</p>
        <p>Would you like to overwrite the existing metrics with the new values from this file?</p>
        <div class="modal-actions" style="margin-top: 24px; justify-content: center; gap: 16px;">
          <button class="actions formButton" style="background: #d93025; color: white; border-color: #d93025;" @click="confirmOverwrite" :disabled="isProcessing">Yes, Overwrite</button>
          <button class="actions cancel" @click="cancelOverwrite" :disabled="isProcessing">Cancel</button>
        </div>
      </div>
    </div>

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
        <h3>Excel Import</h3>
        <pre class="excel-result-pre">{{ excelResultMessage }}</pre>
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
import * as XLSX from 'xlsx';
import VueApexCharts from 'vue3-apexcharts';
import html2pdf from 'html2pdf.js';
import DatabricksProjectValues from '@/components/DatabricksProjectValues.vue'; 
import CombinedProjectValues from '@/components/CombinedProjectValues.vue';

export default {
  name: 'ProjectValuePage',
  components: { 
    VueGoodTable,
    apexchart: VueApexCharts,
    DatabricksProjectValues,
    CombinedProjectValues
  },
  
  directives: {
    focus: {
      mounted(el) {
        el.focus();
      }
    }
  },

  data() {
    return {
      activeTab: 'grid',
      
      // Selected KPIs array for dynamic filtering
      selectedKPIs: ['capacity', 'yield', 'productivity', 'quality'],
      
      columns: [],
      rows: [],
      filteredRows: [],
      selectedRow: null,

      unitCostRows: [],
      selectedUnitCostProjectCode: '',
      isLoadingUnitCosts: false,
      unitCostError: '',
      isLoadingProjectOptions: false,
      unitCostForm: { project_code: '', effective_date: '', avg_unit_cost: '' },
      unitCostSaveError: '',
      unitCostSaveMessage: '',
      showUnitCostEditModal: false,
      unitCostEditOriginalDate: '',
      unitCostEditOriginalCost: '',
      unitCostEditForm: { project_code: '', effective_date: '', avg_unit_cost: '' },
      unitCostEditError: '',

      isProcessing: false,
      isDatabricksBusy: false,
      isCombinedBusy: false,
      isPageLoading: false,
      processingMessage: '',

      showExcelResultDialog: false,
      excelResultMessage: '',

      showAddForm: false,
      showUpdateForm: false,
      openSearchForm: false,
      showSuccessDialog: false,
      showOverwriteModal: false,

      showHistoryModal: false,
      historyData: [],
      isFetchingHistory: false,

      showGlobalHistoryModal: false,
      globalHistoryData: [],
      isFetchingGlobalHistory: false,

      pendingExcelFile: null, 

      successMessage: '',
      formError: '',

      columnFilters: {},
      projectOptions: [],

      editingCell: { rowId: null, field: null },
      editValue: null,
      isSavingInline: false,

      addForm: {
        metric_id: null,
        project_name: '',
        project_code: '',
        month_end: '',
        capacity_improvement: '',
        yield_savings: '',
        people_productivity: '',
        quality_improvement: ''
      },

      updateForm: {
        metric_id: null,
        project_name: '',
        project_code: '',
        month_end: '',
        capacity_improvement: '',
        yield_savings: '',
        people_productivity: '',
        quality_improvement: ''
      }
    };
  },

  computed: {
    activeTabTitle() {
      const titles = {
        grid: 'On Prem Values',
        charts: 'On Prem Analytics',
        'unit-cost': 'Unit Cost Savings',
        'cloud-values': 'Databricks Values',
        'combined-values': 'Combined Values'
      };
      return titles[this.activeTab] || 'Project Value Entry';
    },

    databricksApiBasePath() {
      const base = (process.env.VUE_APP_API_URL || '').replace(/\/+$/, '');
      return `${base}/api/databricks/project-values`;
    },

    // Computed property to dynamically assign a class to the charts grid based on how many are selected
    gridLayoutClass() {
      const len = this.selectedKPIs.length;
      if (len === 1) return 'grid-1';
      if (len === 2) return 'grid-2'; 
      if (len === 3) return 'grid-3';
      return 'grid-4';
    },

    apiBasePath() {
      return `${process.env.VUE_APP_API_URL}/api/project-values`;
    },

    projectMasterApiBasePath() {
      return `${process.env.VUE_APP_API_URL}/api/project-master`;
    },

    isAdmin() {
      return localStorage.getItem('access_right') === 'admin';
    },

    unitCostProjectSummaries() {
      const byProject = new Map();
      const projectNames = new Map(this.projectOptions.map(project => [project.project_code, project.project_name]));

      this.unitCostRows.forEach(row => {
        if (!row.project_code || !row.effective_date || row.avg_unit_cost === null || row.avg_unit_cost === '' || !Number.isFinite(Number(row.avg_unit_cost))) return;
        if (!byProject.has(row.project_code)) byProject.set(row.project_code, []);
        byProject.get(row.project_code).push(row);
      });

      return [...byProject.entries()].map(([project_code, rates]) => {
        rates.sort((a, b) => a.effective_date.localeCompare(b.effective_date));
        const latest = rates[rates.length - 1];
        const previous = rates.length > 1 ? rates[rates.length - 2] : null;
        return {
          project_code,
          project_name: projectNames.get(project_code) || project_code,
          latest,
          previous,
          change: previous ? Number(previous.avg_unit_cost) - Number(latest.avg_unit_cost) : null
        };
      }).sort((a, b) => a.project_name.localeCompare(b.project_name));
    },

    unitCostSelectedRows() {
      return this.unitCostRows
        .filter(row => row.project_code === this.selectedUnitCostProjectCode && row.effective_date && row.avg_unit_cost !== null && row.avg_unit_cost !== '' && Number.isFinite(Number(row.avg_unit_cost)))
        .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    },

    selectedUnitCostProjectName() {
      return this.unitCostProjectSummaries.find(project => project.project_code === this.selectedUnitCostProjectCode)?.project_name || this.selectedUnitCostProjectCode;
    },

    unitCostEditProjectName() {
      return this.projectOptions.find(project => project.project_code === this.unitCostEditForm.project_code)?.project_name || this.unitCostEditForm.project_code;
    },

    unitCostLatest() {
      return this.unitCostSelectedRows[this.unitCostSelectedRows.length - 1] || null;
    },

    unitCostPrevious() {
      return this.unitCostSelectedRows.length > 1 ? this.unitCostSelectedRows[this.unitCostSelectedRows.length - 2] : null;
    },

    unitCostChange() {
      if (!this.unitCostLatest || !this.unitCostPrevious) return null;
      return Number(this.unitCostPrevious.avg_unit_cost) - Number(this.unitCostLatest.avg_unit_cost);
    },

    unitCostChangePercent() {
      if (this.unitCostChange === null || Number(this.unitCostPrevious.avg_unit_cost) === 0) return null;
      return this.unitCostChange / Number(this.unitCostPrevious.avg_unit_cost) * 100;
    },

    unitCostChangeLabel() {
      if (this.unitCostChange === null) return 'Change from previous rate';
      if (this.unitCostChange > 0) return 'Reduction per unit';
      if (this.unitCostChange < 0) return 'Increase per unit';
      return 'No change per unit';
    },

    unitCostChartData() {
      const rates = this.unitCostSelectedRows;
      return {
        series: [{ name: 'Average unit cost', data: rates.map(row => Number(row.avg_unit_cost)) }],
        options: {
          chart: { type: 'line', fontFamily: 'inherit', toolbar: { show: true }, zoom: { enabled: false } },
          colors: ['#117A65'],
          stroke: { curve: 'straight', width: 3 },
          markers: { size: 6 },
          dataLabels: { enabled: false },
          xaxis: { categories: rates.map(row => row.effective_date), title: { text: 'Effective date' } },
          yaxis: {
            min: 0,
            title: { text: 'Average cost per unit' },
            labels: { formatter: value => this.formatUnitCost(value) }
          },
          tooltip: { y: { formatter: value => this.formatUnitCost(value) } },
          title: { text: 'Average unit cost over time', align: 'left' },
          grid: { borderColor: '#e0e6ed', strokeDashArray: 4 }
        }
      };
    },

    // COMPUTED PROPERTY: Cumulative Quarterly Stacked Bar Chart with Line Overlay
    stackedBarChartData() {
      const projectData = {};
      const allQuartersSet = new Set();

      // Group data chronologically by Quarter AND by Project
      this.filteredRows.forEach(row => {
        if (!row.month_end) return;
        
        // Convert "DD/MM/YYYY" into a logical Quarter string like "2024 Q1"
        const [d, m, y] = String(row.month_end).split('/');
        if (!d || !m || !y) return;

        const monthNum = parseInt(m, 10);
        const quarterNum = Math.ceil(monthNum / 3);
        const quarterStr = `${y} Q${quarterNum}`;

        allQuartersSet.add(quarterStr);

        const projName = row.project_name || 'Unknown Project';
        if (!projectData[projName]) projectData[projName] = {};
        if (!projectData[projName][quarterStr]) projectData[projName][quarterStr] = 0;

        // Sum only the actively selected KPIs
        let rowTotal = 0;
        if (this.selectedKPIs.includes('capacity')) rowTotal += Number(row.capacity_improvement) || 0;
        if (this.selectedKPIs.includes('yield')) rowTotal += Number(row.yield_savings) || 0;
        if (this.selectedKPIs.includes('productivity')) rowTotal += Number(row.people_productivity) || 0;
        if (this.selectedKPIs.includes('quality')) rowTotal += Number(row.quality_improvement) || 0;

        projectData[projName][quarterStr] += rowTotal;
      });

      // Sort Quarters chronologically
      const sortedQuarters = Array.from(allQuartersSet).sort((a, b) => a.localeCompare(b));

      // Create a cumulative series array for every single project
      const series = [];
      Object.keys(projectData).forEach(projName => {
        let runningTotal = 0;
        const cumulativeQuarterData = sortedQuarters.map(q => {
          const val = projectData[projName][q] || 0;
          runningTotal += val;
          return Number((runningTotal / 1000).toFixed(1)); 
        });

        // Add projects to the chart as BAR segments if they generated value
        if (runningTotal > 0) {
          series.push({ name: projName, type: 'bar', data: cumulativeQuarterData });
        }
      });

      // Calculate the global running total for the overlay line
      if (series.length > 0) {
        const totalLineData = sortedQuarters.map((q, index) => {
          let sum = 0;
          series.forEach(s => {
            sum += s.data[index] || 0;
          });
          return Number(sum.toFixed(1));
        });

        series.push({
          name: 'Overall Trend',
          type: 'line',
          data: totalLineData
        });
      }

      // Dynamically assign deep, readable colors for bars and a stark gold for the line
      const baseColors = ['#0A2D55', '#117A65', '#6C3483', '#8B0000', '#2C3E50', '#003366', '#4B0082', '#004D40', '#800000', '#2F4F4F'];
      const chartColors = series.map((s, index) => {
        if (s.type === 'line') return '#FFB300'; // Stark Gold/Yellow for the line
        return baseColors[index % baseColors.length];
      });
      
      // Ensure only the line series gets a drawn line/stroke width
      const strokeWidths = series.map(s => s.type === 'line' ? 4 : 0);
      const markerSizes = series.map(s => s.type === 'line' ? 6 : 0);

      // Return Mixed ApexCharts Configuration
      return {
        series: series,
        options: {
          chart: {
            type: 'line', // Must be 'line' to support mixed bar/line series
            stacked: true, 
            fontFamily: 'inherit',
            toolbar: { show: true },
            zoom: { enabled: true }
          },
          colors: chartColors,
          stroke: {
            width: strokeWidths,
            curve: 'smooth'
          },
          markers: {
            size: markerSizes,
            hover: { size: 8 }
          },
          plotOptions: {
            bar: {
              horizontal: false,
              dataLabels: {
                total: {
                  enabled: true, 
                  formatter: function(val) {
                    return '$' + Number(val).toLocaleString('en-US') + 'k';
                  },
                  style: {
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#1f3b64'
                  }
                }
              }
            }
          },
          dataLabels: {
            enabled: false 
          },
          xaxis: {
            categories: sortedQuarters,
            title: { text: 'Quarter', style: { fontWeight: 600, fontSize: '12px', color: '#1f3b64' } }
          },
          yaxis: {
            title: { text: "Cumulative Portfolio Value ($ '000)", style: { fontWeight: 600, fontSize: '12px', color: '#1f3b64' } },
            labels: {
              formatter: function(val) {
                return '$' + Number(val).toLocaleString('en-US');
              }
            }
          },
          title: {
            text: 'Overall Cumulative Value by Project',
            align: 'left',
            style: { fontSize: '16px', fontWeight: 600, color: '#1f3b64' }
          },
          tooltip: {
            y: {
              formatter: function(val) {
                return "$" + Number(val).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
              }
            }
          },
          legend: {
            position: 'right',
            offsetY: 40,
            markers: { shape: 'circle' } // Makes legend markers neat circles
          },
          fill: { opacity: 1 },
          grid: { borderColor: '#e0e6ed', strokeDashArray: 4 }
        }
      };
    },

    chartData() {
      const aggregatedByMonth = {};

      this.filteredRows.forEach(row => {
        if (!row.month_end) return;
        const month = row.month_end;
        if (!aggregatedByMonth[month]) {
          aggregatedByMonth[month] = { capacity: 0, yield: 0, productivity: 0, quality: 0 };
        }
        aggregatedByMonth[month].capacity += Number(row.capacity_improvement) || 0;
        aggregatedByMonth[month].yield += Number(row.yield_savings) || 0;
        aggregatedByMonth[month].productivity += Number(row.people_productivity) || 0;
        aggregatedByMonth[month].quality += Number(row.quality_improvement) || 0;
      });

      const sortedMonths = Object.keys(aggregatedByMonth).sort((a, b) => {
        const [d1, m1, y1] = a.split('/');
        const [d2, m2, y2] = b.split('/');
        return new Date(`${y1}-${m1}-${d1}`) - new Date(`${y2}-${m2}-${d2}`);
      });

      let cumCap = 0, cumYield = 0, cumProd = 0, cumQual = 0;
      const capData = [], yieldData = [], prodData = [], qualData = [];

      sortedMonths.forEach(month => {
        cumCap += aggregatedByMonth[month].capacity;
        cumYield += aggregatedByMonth[month].yield;
        cumProd += aggregatedByMonth[month].productivity;
        cumQual += aggregatedByMonth[month].quality;

        capData.push((cumCap / 1000).toFixed(1));
        yieldData.push((cumYield / 1000).toFixed(1));
        prodData.push((cumProd / 1000).toFixed(1));
        qualData.push((cumQual / 1000).toFixed(1));
      });

      const createOptions = (title, color, dataArray) => {
        const firstValue = dataArray.length > 0 ? Number(dataArray[0]) : 0;
        
        const options = {
          chart: {
            type: 'line',
            fontFamily: 'inherit',
            toolbar: { show: true },
            zoom: { enabled: true }
          },
          colors: [color],
          stroke: { curve: 'smooth', width: 3 },
          xaxis: {
            categories: sortedMonths,
            title: { text: 'Month End Date', style: { fontWeight: 600, fontSize: '12px', color: '#1f3b64' } }
          },
          yaxis: {
            min: firstValue,
            title: { text: "Cumulative Value ($ '000)", style: { fontWeight: 600, fontSize: '12px', color: '#1f3b64' } },
            labels: {
              formatter: function(val) {
                return '$' + Number(val).toLocaleString('en-US');
              }
            }
          },
          markers: { size: 4, hover: { size: 7 } },
          dataLabels: { enabled: false },
          title: {
            text: title,
            align: 'left',
            style: { fontSize: '16px', fontWeight: 600, color: '#1f3b64' }
          },
          tooltip: {
            y: {
              formatter: function(val) {
                return "$" + Number(val).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
              }
            }
          },
          grid: { 
            borderColor: '#e0e6ed', 
            strokeDashArray: 4,
            padding: { top: 40, bottom: 15 }
          }
        };

        if (sortedMonths.length > 0 && dataArray.length > 0) {
          const lastMonth = sortedMonths[sortedMonths.length - 1];
          const lastValue = dataArray[dataArray.length - 1];
          
          const formattedValue = '$' + Number(lastValue).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k';

          options.annotations = {
            points: [{
              x: lastMonth,
              y: lastValue,
              marker: {
                size: 7,
                fillColor: color,
                strokeColor: "#fff",
                strokeWidth: 2,
                shape: "circle"
              },
              label: {
                borderColor: color,
                offsetY: -10,
                style: {
                  color: '#fff',
                  background: color,
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: { left: 6, right: 6, top: 3, bottom: 3 }
                },
                text: formattedValue
              }
            }]
          };
        }

        return options;
      };

      return {
        capacity: {
          series: [{ name: 'Capacity Improvement', data: capData }],
          options: createOptions('Capacity Improvement', '#2563EB', capData)
        },
        yield: {
          series: [{ name: 'Yield Savings', data: yieldData }],
          options: createOptions('Yield Savings', '#117A65', yieldData)
        },
        productivity: {
          series: [{ name: 'People Productivity', data: prodData }],
          options: createOptions('People Productivity', '#124076', prodData)
        },
        quality: {
          series: [{ name: 'Quality Improvement', data: qualData }],
          options: createOptions('Quality Improvement', '#6C3483', qualData)
        }
      };
    },

    globalHistoryColumns() {
      return [
        { label: 'Date Changed', field: 'changed_at' },
        { label: 'Changed By', field: 'changed_by' },
        { label: 'Action', field: 'action_type' },
        { label: 'Metric ID', field: 'metric_id' },
        { label: 'Project Code', field: 'project_code' },
        { label: 'Month End', field: 'month_end' },
        { label: 'Capacity Impr.', field: 'capacity_improvement' },
        { label: 'Yield Savings', field: 'yield_savings' },
        { label: 'People Prod.', field: 'people_productivity' },
        { label: 'Quality Impr.', field: 'quality_improvement' }
      ];
    },

    activeForm() {
      return this.showAddForm ? this.addForm : this.updateForm;
    },

    selectedProjectMeta() {
      const projectName = this.activeForm?.project_name;
      if (!projectName) return {};
      return this.projectOptions.find(p => p.project_name === projectName) || {};
    },

    uniqueProjectNames() {
      const names = this.rows.map(row => row.project_name).filter(Boolean);
      return [...new Set(names)].sort();
    },

    uniqueProjectTypes() {
      const types = this.rows.map(row => row.project_type).filter(Boolean);
      return [...new Set(types)].sort();
    },

    kpiTotals() {
      const totals = {
        capacity: 0,
        yield: 0,
        productivity: 0,
        quality: 0
      };

      this.filteredRows.forEach(row => {
        if (this.selectedKPIs.includes('capacity')) totals.capacity += Number(row.capacity_improvement) || 0;
        if (this.selectedKPIs.includes('yield')) totals.yield += Number(row.yield_savings) || 0;
        if (this.selectedKPIs.includes('productivity')) totals.productivity += Number(row.people_productivity) || 0;
        if (this.selectedKPIs.includes('quality')) totals.quality += Number(row.quality_improvement) || 0;
      });

      return totals;
    },

    goodTableColumns() {
      const preferredOrder = [
        'metric_id',
        'project_code',
        'project_name',
        'project_type',
        'month_end',
        'capacity_improvement',
        'yield_savings',
        'people_productivity',
        'quality_improvement',
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

        const currencyFields = [
          'capacity_improvement',
          'yield_savings',
          'people_productivity',
          'quality_improvement',
          'use_case_investment'
        ];

        if (currencyFields.includes(col)) {
          columnConfig.formatFn = this.formatCurrency;
        }

        if (col === 'project_description') {
          columnConfig.width = '400px'; 
          columnConfig.tdClass = 'wrap-text-cell';
        }

        return columnConfig;
      });
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
      this.fetchProjectOptions(),
      this.fetchTable(),
      this.fetchUnitCosts()
    ]);
  },

  methods: {
    async parseUnitCostResponse(response) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Unit cost API returned HTTP ${response.status} instead of JSON. Check that the updated backend is running at ${response.url}.`);
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `Unit cost request failed (HTTP ${response.status}).`);
      return result;
    },

    openUnitCostEdit(rate) {
      if (this.isProcessing || this.isLoadingUnitCosts) return;
      this.unitCostEditOriginalDate = rate.effective_date;
      this.unitCostEditOriginalCost = String(rate.avg_unit_cost);
      this.unitCostEditForm = {
        project_code: rate.project_code,
        effective_date: rate.effective_date,
        avg_unit_cost: String(rate.avg_unit_cost)
      };
      this.unitCostEditError = '';
      this.showUnitCostEditModal = true;
    },

    closeUnitCostEdit() {
      if (this.isProcessing) return;
      this.showUnitCostEditModal = false;
      this.unitCostEditError = '';
    },

    async submitUnitCostEdit() {
      if (this.isProcessing) return;
      const { project_code, effective_date, avg_unit_cost } = this.unitCostEditForm;
      const costText = String(avg_unit_cost).trim();
      if (!project_code || !effective_date || !/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(costText)) {
        this.unitCostEditError = 'Enter a valid date and a non-negative cost with up to four decimal places.';
        return;
      }

      this.unitCostEditError = '';
      this.unitCostSaveMessage = '';
      this.unitCostSaveError = '';
      this.isProcessing = true;
      this.processingMessage = 'Updating unit cost rate...';
      try {
        const url = `${process.env.VUE_APP_API_URL}/api/project-unit-cost/${encodeURIComponent(project_code)}/${encodeURIComponent(this.unitCostEditOriginalDate)}`;
        const response = await this.apiFetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ effective_date, avg_unit_cost: costText, original_avg_unit_cost: this.unitCostEditOriginalCost })
        });
        await this.parseUnitCostResponse(response);

        this.selectedUnitCostProjectCode = project_code;
        this.showUnitCostEditModal = false;
        await this.fetchUnitCosts();
        this.unitCostSaveMessage = this.unitCostError
          ? 'Rate updated, but the refreshed list could not be loaded. Please retry.'
          : `Rate updated for ${this.selectedUnitCostProjectName}, effective ${effective_date}.`;
      } catch (err) {
        this.unitCostEditError = err.message || 'Could not update the unit cost rate.';
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    async deleteUnitCostRate(rate) {
      if (!this.isAdmin || this.isProcessing || this.isLoadingUnitCosts) return;
      const projectName = this.selectedUnitCostProjectName;
      if (!confirm(`Delete the unit cost rate for ${projectName} effective ${rate.effective_date}? This cannot be undone.`)) return;

      this.unitCostSaveMessage = '';
      this.unitCostSaveError = '';
      this.isProcessing = true;
      this.processingMessage = 'Deleting unit cost rate...';
      try {
        const url = `${process.env.VUE_APP_API_URL}/api/project-unit-cost/${encodeURIComponent(rate.project_code)}/${encodeURIComponent(rate.effective_date)}`;
        const response = await this.apiFetch(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ original_avg_unit_cost: String(rate.avg_unit_cost) })
        });
        await this.parseUnitCostResponse(response);

        await this.fetchUnitCosts();
        this.unitCostSaveMessage = this.unitCostError
          ? 'Rate deleted, but the refreshed list could not be loaded. Please retry.'
          : `Rate for ${projectName} effective ${rate.effective_date} deleted.`;
      } catch (err) {
        this.unitCostSaveError = err.message || 'Could not delete the unit cost rate.';
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    async submitUnitCostRate() {
      if (this.isProcessing || this.isLoadingUnitCosts) return;
      this.unitCostSaveError = '';
      this.unitCostSaveMessage = '';

      const { project_code, effective_date, avg_unit_cost } = this.unitCostForm;
      const costText = String(avg_unit_cost).trim();
      if (!project_code || !effective_date || !/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(costText)) {
        this.unitCostSaveError = 'Select a project and date, and enter a non-negative cost with up to four decimal places.';
        return;
      }

      this.isProcessing = true;
      this.processingMessage = 'Saving unit cost rate...';
      try {
        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-unit-cost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_code, effective_date, avg_unit_cost: costText })
        });
        await this.parseUnitCostResponse(response);

        this.selectedUnitCostProjectCode = project_code;
        this.unitCostForm = { project_code, effective_date: '', avg_unit_cost: '' };
        await this.fetchUnitCosts();
        this.unitCostSaveMessage = this.unitCostError
          ? 'Rate saved, but the refreshed list could not be loaded. Please retry.'
          : `Rate added for ${this.selectedUnitCostProjectName}, effective ${effective_date}.`;
      } catch (err) {
        this.unitCostSaveError = err.message || 'Could not save the unit cost rate.';
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    formatUnitCost(value) {
      if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
      return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    },

    formatPercent(value) {
      return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    },

    async fetchUnitCosts() {
      this.isLoadingUnitCosts = true;
      this.unitCostError = '';
      try {
        const response = await this.apiFetch(`${process.env.VUE_APP_API_URL}/api/project-unit-cost`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Unit cost API returned HTTP ${response.status} instead of JSON. Check that the updated backend is running at ${response.url}.`);
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Unit cost API returned HTTP ${response.status}.`);
        if (!Array.isArray(result)) throw new Error('Unit cost API returned an unexpected response.');

        this.unitCostRows = result.map(row => ({
          ...row,
          effective_date: String(row.effective_date || '').slice(0, 10)
        }));
        if (!this.unitCostProjectSummaries.some(project => project.project_code === this.selectedUnitCostProjectCode)) {
          this.selectedUnitCostProjectCode = this.unitCostProjectSummaries[0]?.project_code || '';
        }
      } catch (err) {
        this.unitCostError = err.message || 'Could not load unit costs.';
      } finally {
        this.isLoadingUnitCosts = false;
      }
    },

    async exportPDF() {
      if (this.isProcessing || this.isPageLoading || this.isDatabricksBusy || this.isCombinedBusy) return;
      
      this.isProcessing = true;
      this.processingMessage = 'Generating single-page PDF... This may take a few seconds.';
      
      try {
        const element = this.$refs.pdfExportArea;
        
        const dashboardWidth = element.scrollWidth;
        const dashboardHeight = element.scrollHeight;
        
        const tabName = {
          grid: 'OnPremValues',
          charts: 'Analytics',
          'unit-cost': 'UnitCostSavings',
          'cloud-values': 'DatabricksValues',
          'combined-values': 'CombinedValues'
        }[this.activeTab] || 'OnPremValues';
        
        const opt = {
          margin:       0,
          filename:     `Project_Value_${tabName}_${new Date().toISOString().slice(0, 10)}.pdf`,
          image:        { type: 'jpeg', quality: 1 },
          html2canvas:  { 
            scale: 2, 
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: dashboardWidth,
            width: dashboardWidth,
            height: dashboardHeight
          },
          jsPDF: { 
            unit: 'px', 
            format: [dashboardWidth, dashboardHeight], 
            orientation: dashboardWidth > dashboardHeight ? 'landscape' : 'portrait' 
          } 
        };
        
        await html2pdf().set(opt).from(element).save();
      } catch (error) {
        alert('Failed to generate PDF: ' + error.message);
      } finally {
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    async restoreHistoricalRecord(log) {
      if (this.isProcessing || log.action_type === 'CURRENT') return;

      const confirmed = confirm(`Are you sure you want to revert to the values from ${log.changed_at}?`);
      if (!confirmed) return;

      this.isProcessing = true;
      this.processingMessage = 'Restoring record...';

      try {
        const payload = {
          project_code: log.project_code,
          project_name: '', 
          month_end: log.month_end,
          capacity_improvement: log.capacity_improvement,
          yield_savings: log.yield_savings,
          people_productivity: log.people_productivity,
          quality_improvement: log.quality_improvement
        };

        const response = await this.apiFetch(`${this.apiBasePath}/${log.metric_id}`, {
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

        await this.fetchTable();

        if (this.showHistoryModal) {
          this.selectedRow = this.rows.find(r => r.metric_id === log.metric_id);
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

    snapToLastDayOfMonth() {
      if (!this.activeForm.month_end) return;

      const [year, month] = this.activeForm.month_end.split('-');
      if (!year || !month) return;

      const lastDay = new Date(year, month, 0);

      const y = lastDay.getFullYear();
      const m = String(lastDay.getMonth() + 1).padStart(2, '0');
      const d = String(lastDay.getDate()).padStart(2, '0');

      this.activeForm.month_end = `${y}-${m}-${d}`;
    },

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

        const formattedHistoricalRecords = historicalRecords.map(log => ({
          ...log,
          month_end: this.formatDisplayDate(log.month_end)
        }));

        const metricsWithHistory = new Set(historicalRecords.map(log => log.metric_id));

        const currentRecords = this.rows
          .filter(row => metricsWithHistory.has(row.metric_id))
          .map(row => ({
            history_id: `current_${row.metric_id}`,
            changed_at: 'Current Status',
            changed_by: 'Active Record',
            action_type: 'CURRENT',
            metric_id: row.metric_id,
            project_code: row.project_code,
            month_end: row.month_end,
            capacity_improvement: row.capacity_improvement,
            yield_savings: row.yield_savings,
            people_productivity: row.people_productivity,
            quality_improvement: row.quality_improvement
          }));

        const combined = [...currentRecords, ...formattedHistoricalRecords];
        combined.sort((a, b) => {
          if (a.metric_id !== b.metric_id) {
            return b.metric_id - a.metric_id;
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
      if (!this.selectedRow || !this.selectedRow.metric_id) {
        return alert("Please select a row first.");
      }

      this.showHistoryModal = true;
      this.isFetchingHistory = true;
      this.historyData = [];

      try {
        const response = await this.apiFetch(`${this.apiBasePath}/${this.selectedRow.metric_id}/history`);
        if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(errData.message || `Backend Server returned ${response.status}`);
        }
        const historicalRecords = await response.json();

        const formattedHistoricalRecords = historicalRecords.map(log => ({
          ...log,
          month_end: this.formatDisplayDate(log.month_end)
        }));

        const currentState = {
          history_id: 'current',
          metric_id: this.selectedRow.metric_id,
          changed_at: 'Current Status',
          changed_by: 'Active Record', 
          action_type: 'CURRENT',
          project_code: this.selectedRow.project_code,
          capacity_improvement: this.selectedRow.capacity_improvement,
          yield_savings: this.selectedRow.yield_savings,
          people_productivity: this.selectedRow.people_productivity,
          quality_improvement: this.selectedRow.quality_improvement
        };

        this.historyData = [currentState, ...formattedHistoricalRecords];
      } catch (err) {
        alert("Error loading history: " + err.message);
        this.showHistoryModal = false;
      } finally {
        this.isFetchingHistory = false;
      }
    },

    startInlineEdit(row, field, currentValue) {
      if (this.isProcessing || this.isPageLoading) return;
      this.editingCell = { rowId: row.metric_id, field };
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

      const newValue = this.editValue === '' ? null : Number(this.editValue);
      const oldValue = row[field] === '' ? null : Number(row[field]);

      if (newValue === oldValue) {
        this.cancelInlineEdit();
        return;
      }

      this.isSavingInline = true;
      this.isProcessing = true;
      this.processingMessage = 'Saving inline edit...';

      try {
        const payload = {
          project_code: row.project_code,
          project_name: row.project_name,
          month_end: row.month_end, 
          capacity_improvement: field === 'capacity_improvement' ? newValue : row.capacity_improvement,
          yield_savings: field === 'yield_savings' ? newValue : row.yield_savings,
          people_productivity: field === 'people_productivity' ? newValue : row.people_productivity,
          quality_improvement: field === 'quality_improvement' ? newValue : row.quality_improvement,
        };

        const response = await this.apiFetch(`${this.apiBasePath}/${row.metric_id}`, {
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

    clearTableUI() {
      if (this.isProcessing || this.isPageLoading) return;
      this.rows = [];
      this.filteredRows = [];
      this.selectedRow = null;
    },

    emptyForm() {
      return {
        metric_id: null,
        project_name: '',
        project_code: '',
        month_end: '',
        capacity_improvement: '',
        yield_savings: '',
        people_productivity: '',
        quality_improvement: ''
      };
    },

    getColumnLabel(col) {
      const labelMap = {
        metric_id: 'Metric ID',
        project_code: 'Project Code',
        project_name: 'Project Name',
        project_type: 'Project Type',
        month_end: 'Month End',
        capacity_improvement: 'Capacity Improvement',
        yield_savings: 'Yield Savings',
        people_productivity: 'People Productivity',
        quality_improvement: 'Quality Improvement',
        use_case_investment: 'Use Case Investment',
        project_description: 'Project Description'
      };

      return labelMap[col] || this.formatLabel(col);
    },

    formatLabel(col) {
      return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    formatCurrency(value) {
      if (value === null || value === undefined || value === '') return '';
      return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    formatDisplayDate(value) {
      if (!value) return '';

      const str = String(value);
      let year, month, day;

      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        year = str.slice(0, 4);
        month = str.slice(5, 7);
        day = str.slice(8, 10);
      } else {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return str.slice(0, 10);
        
        const pad = n => String(n).padStart(2, '0');
        year = date.getFullYear();
        month = pad(date.getMonth() + 1);
        day = pad(date.getDate());
      }

      return `${day}/${month}/${year}`;
    },

    async apiFetch(url, options = {}) {
      const token = localStorage.getItem('token');

      if (!options.headers) options.headers = {};
      options.headers['Authorization'] = 'Bearer ' + token;

      const response = await fetch(url, options);

      if (response.status === 401) {
        alert('Session expired. Please log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('access_right');
        this.$router.push('/login');
        throw new Error('Session expired');
      }

      if (response.status === 403) {
        throw new Error('You are not authorized to perform this action.');
      }

      return response;
    },

    async fetchProjectOptions() {
      this.isLoadingProjectOptions = true;
      try {
        let response = await this.apiFetch(`${this.projectMasterApiBasePath}/options`);

        if (!response.ok) {
          response = await this.apiFetch(this.projectMasterApiBasePath);
        }

        if (!response.ok) {
          throw new Error('Failed to load project dropdown options');
        }

        const data = await response.json();
        this.projectOptions = Array.isArray(data) ? data : [];
      } catch (err) {
        console.error('Failed to load project options:', err);
        this.projectOptions = [];
      } finally {
        this.isLoadingProjectOptions = false;
      }
    },

    async fetchTable() {
      this.isPageLoading = true;

      try {
        const response = await this.apiFetch(this.apiBasePath);
        if (!response.ok) throw new Error('Failed to fetch project value data');

        const data = await response.json();

        const formattedData = data.map(row => ({
          ...row,
          month_end: this.formatDisplayDate(row.month_end)
        }));

        this.rows = formattedData;
        this.filteredRows = [...formattedData];

        if (formattedData.length > 0) {
          this.columns = Object.keys(formattedData[0]);
        } else {
          const colRes = await this.apiFetch(`${this.apiBasePath}/columns`);
          if (!colRes.ok) throw new Error('Failed to fetch table columns');

          const cols = await colRes.json();
          this.columns = cols;
        }
      } catch (err) {
        alert(err.message || 'Failed to fetch project value data');
      } finally {
        this.isPageLoading = false;
      }
    },

    handleProjectSelection() {
      const meta = this.selectedProjectMeta;
      if (!this.activeForm || !meta) return;

      this.activeForm.project_code = meta.project_code || '';
    },

    exportData() {
      if (this.isProcessing || this.isPageLoading) return;

      const exportRows = this.filteredRows.length ? this.filteredRows : this.rows;
      const exportColumns = this.columns;
      const headers = exportColumns.map(col => this.getColumnLabel(col));

      const data = [
        headers,
        ...exportRows.map(row => exportColumns.map(col => row[col] ?? ''))
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ProjectValues');
      XLSX.writeFile(workbook, 'project-value-calculation.xlsx');
    },

    async handleExcelImport(event) {
      if (this.isProcessing || this.isPageLoading) return;

      const fileInput = event.target;
      const file = fileInput.files[0];

      if (!file) {
        return;
      }

      const lowerFileName = file.name.toLowerCase();
      if (!lowerFileName.endsWith('.xlsx') && !lowerFileName.endsWith('.xls')) {
        this.excelResultMessage = 'Please select an Excel (.xlsx or .xls) file.';
        this.showExcelResultDialog = true;
        fileInput.value = '';
        return;
      }

      this.pendingExcelFile = file;
      await this.processExcelUpload(file, false);
      fileInput.value = ''; 
    },

    async processExcelUpload(file, overwrite = false) {
      this.isProcessing = true;
      this.processingMessage = overwrite ? 'Overwriting data, please wait...' : 'Importing Excel, please wait...';

      const formData = new FormData();
      formData.append('file', file);
      
      if (overwrite) {
        formData.append('overwrite', 'true');
      }

      try {
        const response = await this.apiFetch(`${this.apiBasePath}/import`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (response.status === 409 && result.requires_confirmation) {
          this.showOverwriteModal = true;
          return; 
        }

        if (!response.ok) {
          throw new Error(result.message || 'Excel import failed.');
        }

        this.excelResultMessage = result.message || 'Excel import completed successfully.';
        this.showExcelResultDialog = true;
        this.showOverwriteModal = false;
        this.pendingExcelFile = null;

        await this.fetchTable();
      } catch (err) {
        this.excelResultMessage = err.message || 'Excel import failed.';
        this.showExcelResultDialog = true;
      } finally {
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    confirmOverwrite() {
      this.showOverwriteModal = false;
      if (this.pendingExcelFile) {
        this.processExcelUpload(this.pendingExcelFile, true); 
      }
    },

    cancelOverwrite() {
      this.showOverwriteModal = false;
      this.pendingExcelFile = null;
    },

    goHome() {
      if (this.isProcessing || this.isPageLoading) return;
      this.$router.push('/landing');
    },

    openSpotfire() {
      if (this.isProcessing || this.isPageLoading) return;
      window.open('https://mda-spotfire-analysts.westeurope.azure.st.com/spotfire/wp/OpenAnalysis?file=efd28141-f4a6-4022-89b8-0644ee14e4bd', '_blank');
    },

    async logout() {
      if (this.isProcessing || this.isPageLoading) return;
      this.isProcessing = true;
      this.processingMessage = 'Logging out and clearing your Databricks connection...';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const base = (process.env.VUE_APP_API_URL || '').replace(/\/+$/, '');
        const response = await fetch(`${base}/api/logout`, {
          method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
          cache: 'no-store', keepalive: true, signal: controller.signal
        });
        // An expired/already ended GUI session is also safe to clear locally.
        if (!response.ok && response.status !== 401 && response.status !== 403) {
          throw new Error('The backend could not complete logout.');
        }
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('access_right');
        await this.$router.push('/login');
      } catch {
        alert('Logout could not reach the backend to clear your Databricks connection. Retry Logout when the backend is available.');
      } finally {
        clearTimeout(timeout);
        this.isProcessing = false;
        this.processingMessage = '';
      }
    },

    isFieldDisabled() {
      return this.isProcessing;
    },

    openAddForm() {
      if (this.isProcessing || this.isPageLoading) return;
      this.addForm = this.emptyForm();
      this.formError = '';
      this.showAddForm = true;
      this.showUpdateForm = false;
    },

    openUpdateForm() {
      if (this.isProcessing || this.isPageLoading) return;
      if (!this.selectedRow) {
        alert('Please select a row to update.');
        return;
      }

      this.updateForm = {
        metric_id: this.selectedRow.metric_id ?? null,
        project_name: this.selectedRow.project_name || '',
        project_code: this.selectedRow.project_code || '',
        month_end: this.selectedRow.month_end ? String(this.selectedRow.month_end).slice(0, 10) : '',
        capacity_improvement: this.selectedRow.capacity_improvement ?? '',
        yield_savings: this.selectedRow.yield_savings ?? '',
        people_productivity: this.selectedRow.people_productivity ?? '',
        quality_improvement: this.selectedRow.quality_improvement ?? ''
      };

      this.formError = '';
      this.showUpdateForm = true;
      this.showAddForm = false;
    },

    closeForm() {
      if (this.isProcessing) return;
      this.showAddForm = false;
      this.showUpdateForm = false;
      this.formError = '';
    },

    normalizePayload(form) {
      return {
        project_code: form.project_code || null,
        project_name: form.project_name || null,
        month_end: form.month_end || null,
        capacity_improvement: form.capacity_improvement === '' ? null : Number(form.capacity_improvement),
        yield_savings: form.yield_savings === '' ? null : Number(form.yield_savings),
        people_productivity: form.people_productivity === '' ? null : Number(form.people_productivity),
        quality_improvement: form.quality_improvement === '' ? null : Number(form.quality_improvement)
      };
    },

    validateForm(form) {
      if (!form.project_name && !form.project_code) return 'Project is required.';
      if (!form.month_end) return 'Month End is required.';

      if (
        form.capacity_improvement === '' &&
        form.yield_savings === '' &&
        form.people_productivity === '' &&
        form.quality_improvement === ''
      ) {
        return 'Please enter at least one KPI metric.';
      }

      const numericFields = [
        'capacity_improvement',
        'yield_savings',
        'people_productivity',
        'quality_improvement'
      ];

      for (const field of numericFields) {
        if (form[field] !== '' && Number.isNaN(Number(form[field]))) {
          return `${this.getColumnLabel(field)} must be a number.`;
        }
      }

      return '';
    },

    async submitAddForm() {
      if (this.isProcessing) return;

      const validationError = this.validateForm(this.addForm);
      if (validationError) {
        this.formError = validationError;
        return;
      }

      this.isProcessing = true;
      this.processingMessage = 'Adding row, please wait...';
      this.formError = '';

      try {
        const payload = this.normalizePayload(this.addForm);

        const response = await this.apiFetch(this.apiBasePath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to add row.');
        }

        this.closeForm();
        await this.fetchTable();
        this.selectedRow = null;
        this.successMessage = 'Row added successfully!';
        this.showSuccessDialog = true;
      } catch (err) {
        this.formError = err.message;
      } finally {
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    async submitUpdateForm() {
      if (this.isProcessing) return;

      const validationError = this.validateForm(this.updateForm);
      if (validationError) {
        this.formError = validationError;
        return;
      }

      this.isProcessing = true;
      this.processingMessage = 'Updating row, please wait...';
      this.formError = '';

      try {
        const payload = this.normalizePayload(this.updateForm);

        const response = await this.apiFetch(`${this.apiBasePath}/${this.updateForm.metric_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to update row.');
        }

        this.closeForm();
        await this.fetchTable();
        this.selectedRow = null;
        this.successMessage = 'Row updated successfully!';
        this.showSuccessDialog = true;
      } catch (err) {
        this.formError = err.message;
      } finally {
        this.processingMessage = '';
        this.isProcessing = false;
      }
    },

    selectRow({ row }) {
      if (this.isProcessing || this.isPageLoading) return;
      this.selectedRow = row;
    },

    rowClassFn(row) {
      return this.selectedRow && this.selectedRow.metric_id === row.metric_id ? 'selected' : '';
    },

    applyColumnFilters() {
      if (this.isProcessing) return;

      this.filteredRows = this.rows.filter(row =>
        Object.entries(this.columnFilters).every(([field, value]) => {
          if (!value) return true;
          return String(row[field] || '').toLowerCase().includes(String(value).toLowerCase());
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
    }
  }
};
</script>

<style scoped>
.unit-cost-section {
  background: #f8f9fb;
  padding: 24px;
  border: 1px solid #d9d9d9;
  border-radius: 12px;
}

.unit-cost-entry {
  margin: 24px 0;
  padding: 20px;
  background: white;
  border: 1px solid #d9e3ed;
  border-radius: 10px;
}

.unit-cost-entry h4 {
  margin: 0 0 6px;
  color: #1f3b64;
}

.unit-cost-entry p {
  margin: 0 0 14px;
  color: #495057;
}

.unit-cost-entry-form {
  display: grid;
  grid-template-columns: minmax(230px, 2fr) repeat(2, minmax(170px, 1fr)) auto;
  gap: 14px;
  align-items: end;
}

.unit-cost-entry-form label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #1f3b64;
  font-weight: 600;
}

.unit-cost-entry-form select,
.unit-cost-entry-form input {
  width: 100%;
  min-height: 39px;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid #becbd8;
  border-radius: 6px;
  background: white;
  font: inherit;
}

.unit-cost-entry .unit-cost-error {
  color: #a12626;
  margin: 12px 0 0;
}

.unit-cost-edit-modal {
  width: min(90%, 520px);
}

.unit-cost-edit-modal .form-group {
  margin-bottom: 16px;
}

.unit-cost-row-actions {
  white-space: nowrap;
}

.unit-cost-row-actions button + button {
  margin-left: 8px;
}

.unit-cost-delete-btn {
  background: #fff;
  color: #a12626;
  border: 1px solid #a12626;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.unit-cost-delete-btn:hover:not(:disabled) {
  background: #a12626;
  color: white;
}

.unit-cost-success {
  color: #117a65 !important;
  font-weight: 600;
  margin: 12px 0 0 !important;
}

@media (max-width: 1000px) {
  .unit-cost-entry-form {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }
}

@media (max-width: 560px) {
  .unit-cost-entry-form {
    grid-template-columns: 1fr;
  }
}

.unit-cost-message {
  padding: 18px 0;
  color: #495057;
}

.unit-cost-error {
  color: #a12626;
}

.unit-cost-error button {
  margin-left: 12px;
}

.unit-cost-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 0;
}

.unit-cost-count {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: #1f3b64;
}

.unit-cost-count strong {
  font-size: 2rem;
}

.unit-cost-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 600;
  color: #1f3b64;
  min-width: min(100%, 360px);
}

.unit-cost-picker select {
  padding: 9px 12px;
  border: 1px solid #becbd8;
  border-radius: 6px;
  background: white;
  font-size: 1rem;
}

.unit-cost-detail h4,
.unit-cost-list-title {
  color: #1f3b64;
  margin: 24px 0 12px;
}

.unit-cost-detail h4 span {
  font-weight: 400;
  color: #66758a;
}

.unit-cost-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.unit-cost-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: white;
  padding: 20px;
  border: 1px solid #d9e3ed;
  border-radius: 10px;
}

.unit-cost-card span {
  color: #42526b;
  font-weight: 600;
}

.unit-cost-card strong {
  color: #123b69;
  font-size: 1.7rem;
}

.unit-cost-card small {
  color: #66758a;
}

.unit-cost-reduction strong {
  color: #117a65;
}

.unit-cost-increase strong {
  color: #b54736;
}

.unit-cost-chart {
  margin-bottom: 20px;
}

.unit-cost-table-wrap {
  overflow-x: auto;
  max-height: 350px;
  border: 1px solid #e0e6ed;
  border-radius: 8px;
  background: white;
}

.unit-cost-table-wrap table {
  min-width: 760px;
}

.unit-cost-selected-row {
  background: #edf6ff;
}

.unit-cost-project-link {
  background: none;
  border: 0;
  padding: 0;
  color: #1f5fa8;
  font: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
}

/* PDF Export Wrapper */
.pdf-export-container {
  background: white;
  width: 100%;
}

/* Checkbox Group Styling for KPI Filters */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #fff;
  height: 35px;
  box-sizing: border-box;
  align-items: center;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  color: #333;
  margin: 0;
  cursor: pointer;
  font-size: 0.9rem;
}

.checkbox-group input {
  margin: 0;
  cursor: pointer;
}

/* Dynamic CSS Grid for Charts Layout */
.charts-grid {
  display: grid;
  gap: 24px;
  margin-top: 20px;
}

.grid-1 { grid-template-columns: 1fr; }
.grid-2 { grid-template-columns: 1fr; } /* Stack 2 KPIs directly on top of each other */
.grid-3 { grid-template-columns: 1fr 1fr; }
.grid-4 { grid-template-columns: 1fr 1fr; }

/* In a 3-grid layout, force the 3rd chart to stretch across the entire bottom row */
.grid-3 .chart-card:nth-child(3) {
  grid-column: 1 / -1; 
}

.chart-card {
  background: #ffffff;
  border: 1px solid #e0e6ed;
  border-radius: 12px;
  padding: 16px 16px 0 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

/* On smaller screens, completely stack the charts */
@media (max-width: 1150px) {
  .grid-1, .grid-2, .grid-3, .grid-4 {
    grid-template-columns: 1fr !important;
  }
  .grid-3 .chart-card:nth-child(3) {
    grid-column: auto !important;
  }
}

/* Tabs Styling */
.tabs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  border-bottom: 2px solid #e0e6ed;
  padding-bottom: 12px;
}

.tab-btn {
  background: #f8f9fb;
  color: #1f3b64;
  border: 1px solid #d9d9d9;
  padding: 10px 24px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  min-height: 42px;
  max-width: 100%;
  transition: all 0.2s ease-in-out;
}

.tab-btn:hover {
  background: #e7edf5;
}

.tab-btn.active {
  background: #1f5fa8;
  color: white;
  border-color: #1f5fa8;
  box-shadow: 0 4px 10px rgba(31, 95, 168, 0.3);
}

.tab-btn:focus-visible {
  outline: 3px solid #b77900;
  outline-offset: 3px;
}

@media (max-width: 1000px) {
  .top-bar {
    height: auto;
    min-height: 80px;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 20px;
  }
  .top-bar .left { min-width: 0; max-width: 100%; }
  .topbar-actions { flex-wrap: wrap; gap: 8px; }
  .top-bar .title { white-space: normal; }
  .top-bar .home-btn, .top-bar .logout-btn, .top-bar .pdf-btn, .top-bar .spotfire-btn { font-size: .9rem; padding: 8px 12px; min-height: 40px; }
  .tabs-container { gap: 8px; }
  .tab-btn { font-size: .9rem; padding: 9px 14px; }
}

@media (max-width: 480px) {
  .top-bar .logo { width: 72px; margin: 0 12px 0 0; }
  .top-bar .title { font-size: 1.1rem; }
}

/* Charts Container */
.charts-section {
  background: #f8f9fb;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #d9d9d9;
}

.chart-title {
  margin: 0;
  font-size: 1.4rem;
  color: #1f3b64;
}

.chart-subtitle {
  margin: 4px 0 0 0;
  color: #666;
  font-size: 0.95rem;
}

/* X-Large Modal for Global Audit Log */
.x-large-modal {
  width: 95%;
  max-width: 1400px;
}

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

/* ========================================================== */
/* NEW: CSS for expanding Inline Editable Cells completely    */
/* ========================================================== */

.inline-edit-hint {
  background-color: #e7edf5;
  color: #1f5fa8;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.95rem;
  border: 1px solid #c2d5ee;
}

.editable-cell {
  cursor: pointer;
  border: 1px dashed transparent;
  border-radius: 4px;
  transition: all 0.2s ease-in-out;
  display: flex;            /* Makes the hit box block-level */
  align-items: center;      /* Keeps the text vertically centered */
  width: 100%;              /* Forces the hit box to stretch */
  min-width: 50px;
  min-height: 30px;         /* Expands the physical clickable height */
  padding: 2px 6px;         /* Adds a comfortable padding inside the box */
  box-sizing: border-box;
}

.editable-cell:hover {
  border-color: #1f5fa8;
  background-color: #f0f4f8;
}

.inline-input {
  display: block;
  width: 100% !important;   /* Forces the input to overwrite everything and stretch */
  min-height: 32px;
  padding: 6px 8px;         /* Thicker padding for a better input experience */
  border: 2px solid #1f5fa8; /* Visually pops when active */
  border-radius: 4px;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  box-sizing: border-box;
  background-color: #fff;
  box-shadow: 0 0 5px rgba(31, 95, 168, 0.2);
}

/* Original CSS */
.quick-filters-container {
  display: flex;
  gap: 24px;
  margin: 16px 0;
  padding: 16px;
  background: #f8f9fb;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  flex-wrap: wrap;
}

.quick-filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 250px;
}

.quick-filter-group label {
  font-weight: 600;
  color: #1f3b64;
  font-size: 0.95rem;
  margin: 0;
}

.quick-filter-group select {
  padding: 0 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  background-color: white;
  cursor: pointer;
  height: 35px;
  box-sizing: border-box;
}

/* Dynamically scaling KPI Summary Container */
.kpi-summary-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 16px 0 24px 0;
}

.metric-card {
  padding: 20px 16px;
  border-radius: 10px;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.metric-card h4 {
  margin: 0 0 10px 0;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.9;
  font-weight: 600;
}

.metric-content {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.metric-value {
  font-size: 1.8rem;
  font-weight: 800;
}

.bg-kpi-1 { background: linear-gradient(135deg, #1E3A8A, #2563EB); } /* Cobalt Blue */
.bg-kpi-2 { background: linear-gradient(135deg, #004D40, #117A65); } /* Deep Teal */
.bg-kpi-3 { background: linear-gradient(135deg, #0A2D55, #124076); } /* Dark Navy */
.bg-kpi-4 { background: linear-gradient(135deg, #4A235A, #6C3483); } /* Amethyst Purple */

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
.pdf-btn,
.spotfire-btn {
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

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
}

.full-width {
  grid-column: 1 / -1;
}

.home-btn:hover,
.logout-btn:hover,
.pdf-btn:hover,
.spotfire-btn:hover {
  background: #ffd600;
  color: #07254a;
  border-color: #ffd600;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.large-modal {
  width: 90%;
  max-width: 1200px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(250px, 1fr));
  gap: 16px;
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

.upload-icon,
.export-btn {
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

.upload-icon:hover,
.export-btn:hover:not(:disabled) {
  background: #218838;
  border-color: #218838;
}

.upload-icon:active,
.export-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.excel-result-pre {
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
  max-width: 700px;
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
