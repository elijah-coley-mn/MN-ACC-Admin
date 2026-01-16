export class BatchAssignUI {
    #accountId;
    #users;
    #projects;
    #usersLoaded;

    constructor() {
        this.#accountId = null;
        this.#users = [];
        this.#projects = [];
        this.#usersLoaded = false;
    }

    async loadData(accountId) {
        this.#accountId = accountId;
        $("#loadingoverlay").fadeIn();
        
        console.log('loadData called with accountId:', accountId);
        
        try {
            // Load users only once (from MN Template)
            if (!this.#usersLoaded) {
                const templateProjectId = 'f10b23d2-5bbb-4827-800e-d4d385ca73ca';
                
                try {
                    const usersResp = await axios.get('/api/admin/project/users', { 
                        params: { projectId: templateProjectId } 
                    });
                    
                    this.#users = usersResp.data;
                    this.#usersLoaded = true;
                    console.log(`Loaded ${this.#users.length} users from MN Template project`);
                    
                    if (this.#users.length === 0) {
                        alert('No users found in MN Template project. Please add users to the template project first.');
                        $("#loadingoverlay").fadeOut();
                        return;
                    }
                } catch (err) {
                    console.error('Failed to load users from MN Template project:', err);
                    alert('Failed to load users from MN Template project. Make sure it exists and has users assigned.');
                    $("#loadingoverlay").fadeOut();
                    return;
                }
            }
            
            // Always reload projects for current account
            const projectsResp = await axios.get('/api/admin/projects', { 
                params: { accountId } 
            });
            this.#projects = projectsResp.data;
            
            console.log('Loaded projects:', this.#projects.length);
            
            if (this.#projects.length === 0) {
                alert('No projects found in this account.');
                $("#loadingoverlay").fadeOut();
                return;
            }
            
            this.render();
        } catch (err) {
            console.error('Failed to load batch assign data:', err);
            alert('Failed to load data. See console for details.');
        } finally {
            $("#loadingoverlay").fadeOut();
        }
    }


    render() {
        console.log('BatchAssignUI render() called');
        console.log('Users:', this.#users.length);
        console.log('Projects:', this.#projects.length);
        
        // Destroy the table first
        try {
            $('#accTable').bootstrapTable('destroy');
        } catch (err) {
            console.warn('Could not destroy table:', err);
        }
        
        // Find the main table container
        const container = $('#table');
        
        console.log('Container found:', container.length);
        
        // Build custom UI
        const html = `
            <div id="batch-assign-container" style="padding: 20px; background: white;">
                <h3 style="margin-bottom: 20px;">Batch User Assignment</h3>
                
                <div style="margin-bottom: 30px;">
                    <h4>Select User to Assign</h4>
                    <select id="batch-user-select" class="form-control" style="max-width: 500px;">
                        <option value="">-- Select a user --</option>
                        ${this.#users.map((u, index) => 
                            `<option value="${index}">${u.name || u.email} (${u.email})</option>`
                        ).join('')}
                    </select>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h4>Select Projects</h4>
                    <div style="margin-bottom: 10px;">
                        <input type="text" id="project-search" class="form-control" placeholder="Search projects..." style="max-width: 500px; margin-bottom: 10px;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <button id="select-all-projects" class="btn btn-default btn-sm">Select All</button>
                        <button id="deselect-all-projects" class="btn btn-default btn-sm">Deselect All</button>
                        <button id="select-visible-projects" class="btn btn-default btn-sm">Select Visible</button>
                        <span id="project-count" style="margin-left: 15px; color: #666;">0 projects selected</span>
                    </div>
                    <div id="project-checklist" style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 15px; background: #f9f9f9;">
                        ${this.#projects.map(p => `
                            <div class="project-item" data-project-name="${p.name.toLowerCase()}" style="margin-bottom: 8px;">
                                <label style="font-weight: normal; cursor: pointer; display: block; padding: 5px; border-radius: 3px;" class="project-label">
                                    <input type="checkbox" class="project-checkbox" value="${p.id}" style="margin-right: 10px;">
                                    ${p.name}
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h4>Role (Optional)</h4>
                    <input id="role-id-input" type="text" class="form-control" placeholder="Leave blank for user's existing role" style="max-width: 500px;">
                    <small class="help-block">Enter role UUID (leave blank to use user's existing role from MN Template)</small>
                </div>
                
                <button id="execute-batch-assign" class="btn btn-primary btn-lg">
                    Assign User to Selected Projects
                </button>
                
                <div id="batch-results" style="margin-top: 30px; display: none;">
                    <h4>Results</h4>
                    <div id="batch-results-content"></div>
                </div>
            </div>
        `;
        
        container.html(html);
        
        console.log('Batch assign UI rendered');
        
        // Bind events
        this.bindEvents();
    }

    bindEvents() {
        const self = this;
        let lastChecked = null;
        
        // Project search
        $('#project-search').on('input', function() {
            const searchTerm = $(this).val().toLowerCase();
            
            if (searchTerm === '') {
                // Show all projects
                $('.project-item').show();
            } else {
                // Filter projects
                $('.project-item').each(function() {
                    const projectName = $(this).data('project-name');
                    if (projectName.includes(searchTerm)) {
                        $(this).show();
                    } else {
                        $(this).hide();
                    }
                });
            }
            
            self.updateProjectCount();
        });
        
        // Hover effect on project labels
        $(document).on('mouseenter', '.project-label', function() {
            $(this).css('background', '#e8f4f8');
        }).on('mouseleave', '.project-label', function() {
            $(this).css('background', 'transparent');
        });
        
        // Shift-click selection for project checkboxes
        $(document).on('click', '.project-checkbox', function(e) {
            const $current = $(this);
            
            if (e.shiftKey && lastChecked) {
                // Get all visible checkboxes
                const $allCheckboxes = $('.project-item:visible .project-checkbox');
                const currentIndex = $allCheckboxes.index($current);
                const lastIndex = $allCheckboxes.index(lastChecked);
                
                // Determine range
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);
                
                // Check all checkboxes in range
                const isChecked = $current.prop('checked');
                $allCheckboxes.slice(start, end + 1).prop('checked', isChecked);
            }
            
            lastChecked = $current;
            self.updateProjectCount();
        });
        
        // Update count when checkboxes change (for programmatic changes)
        $(document).on('change', '.project-checkbox', function(e) {
            // Only update count if not from a click (click handler already updates)
            if (!e.originalEvent) {
                self.updateProjectCount();
            }
        });
        
        // Select/deselect all
        $('#select-all-projects').on('click', function() {
            $('.project-checkbox').prop('checked', true);
            lastChecked = null; // Reset shift-click tracking
            self.updateProjectCount();
        });
        
        $('#deselect-all-projects').on('click', function() {
            $('.project-checkbox').prop('checked', false);
            lastChecked = null; // Reset shift-click tracking
            self.updateProjectCount();
        });
        
        // Select only visible (filtered) projects
        $('#select-visible-projects').on('click', function() {
            $('.project-item:visible .project-checkbox').prop('checked', true);
            lastChecked = null; // Reset shift-click tracking
            self.updateProjectCount();
        });
        
        // Execute assignment
        $('#execute-batch-assign').on('click', function() {
            self.executeBatchAssign();
        });
    }

    updateProjectCount() {
        const count = $('.project-checkbox:checked').length;
        $('#project-count').text(`${count} project${count !== 1 ? 's' : ''} selected`);
    }

    async executeBatchAssign() {
        const userIndex = $('#batch-user-select').val();
        const roleId = $('#role-id-input').val().trim() || null;
        const selectedProjects = $('.project-checkbox:checked')
            .map(function() { return $(this).val(); })
            .get();
        
        // Validation
        if (!userIndex) {
            alert('Please select a user');
            return;
        }
        
        if (selectedProjects.length === 0) {
            alert('Please select at least one project');
            return;
        }
        
        const selectedUser = this.#users[parseInt(userIndex)];
        const userName = selectedUser.name || selectedUser.email;
        const confirmMsg = `Assign ${userName} to ${selectedProjects.length} project(s)?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        $("#loadingoverlay").fadeIn();
        $('#batch-results').hide();
        
        try {
            const response = await axios.post('/api/admin/batch-assign', {
            accountId: this.#accountId,
            userEmail: selectedUser.email,
            companyId: selectedUser.companyId,
            roleIds: selectedUser.roleIds,
            products: selectedUser.products,
            projectIds: selectedProjects,
            roleId: roleId  // Optional override role
        });
            
            this.displayResults(response.data);
        } catch (err) {
            console.error('Batch assign failed:', err);
            alert('Batch assignment failed. See console for details.');
        } finally {
            $("#loadingoverlay").fadeOut();
        }
    }

    displayResults(results) {
        const successCount = results.successful || 0;
        const failCount = results.failed || 0;
        const details = results.details || [];
        
        let html = `
            <div class="alert ${failCount === 0 ? 'alert-success' : 'alert-warning'}">
                <strong>Assignment Complete:</strong> ${successCount} successful, ${failCount} failed
            </div>
        `;
        
        if (failCount > 0) {
            html += '<div style="margin-top: 15px;"><strong>Failed assignments:</strong><ul>';
            details.filter(d => !d.success).forEach(d => {
                const project = this.#projects.find(p => p.id === d.projectId);
                const projectName = project ? project.name : d.projectId;
                html += `<li>${projectName}: ${d.error}</li>`;
            });
            html += '</ul></div>';
        }
        
        $('#batch-results-content').html(html);
        $('#batch-results').show();
    }
}

// Global instance
let g_batchAssignUI = null;

export function isBatchAssignActive() {
    return $('#batch-assign-container').length > 0;
}

export function initBatchAssign(accountId) {
    console.log('initBatchAssign called with accountId:', accountId);
    
    if (!g_batchAssignUI) {
        g_batchAssignUI = new BatchAssignUI();
    }
    g_batchAssignUI.loadData(accountId);
}