/*
 * Atome Bakery Production Schedule Application
 * 
 * Code Structure:
 * 1. State Management - Application state and initialization
 * 2. Event Listeners - UI event handlers
 * 3. Rendering Functions - Task library, schedule grid, modals
 * 4. Schedule Management - Add/remove tasks, date management
 * 5. Task Management - CRUD operations for tasks
 * 6. Template Management - Save/load/import/export templates
 * 7. Storage Management - localStorage persistence
 * 8. Utility Functions - Helper functions
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

// Application State
const state = {
    tasks: [],
    categories: ['Preparation', 'Baking', 'Packaging', 'Cleaning', 'Other'], // Default categories
    bakers: {}, // { date: ['Baker 1', 'Baker 2', ...] } - bakers are date-specific
    schedule: {}, // { date: { bakerIndex: { timeSlot: task } } }
    customTaskNames: {}, // { date: { bakerIndex: { startTime: customName } } }
    scheduledTaskInstances: {}, // { instanceId: { duration, productCount, description, color, etc. } }
    templates: {},
    currentDate: getTodayDateString(),
    openDates: [getTodayDateString()], // Array of open date tabs
    editingTask: null,
    editingBaker: null,
    selectedTasks: new Set(), // Set of selected task instance IDs for multi-select
    collapsedCategories: new Set(), // Set of collapsed category names (all collapsed by default)
    taskColors: [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12',
        '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
    ]
};

// ============================================================================
// 2. INITIALIZATION
// ============================================================================

// Clear task selection
function clearTaskSelection() {
    state.selectedTasks.forEach(instanceId => {
        const taskElement = document.querySelector(`[data-instance-id="${instanceId}"]`)?.closest('.scheduled-task');
        if (taskElement) {
            taskElement.classList.remove('selected');
        }
    });
    state.selectedTasks.clear();
}

// Initialize App
function init() {
    loadFromStorage();
    
    // If no collapsed categories were loaded, default to all collapsed
    if (state.collapsedCategories.size === 0) {
        state.collapsedCategories = new Set([...state.categories, '']); // Include empty string for uncategorized
    }
    
    setupEventListeners();
    setupPanelResizer();
    renderTaskLibrary();
    renderScheduleTabs();
    renderSchedule();
    updateDateInput();
    syncHeaderScroll();
    
    // Set default tasks if none exist, or merge missing default tasks
    if (state.tasks.length === 0) {
        loadDefaultTasks();
    } else {
        // Merge missing default tasks (in case user has some tasks but not all defaults)
        mergeDefaultTasks();
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key clears selection
        if (e.key === 'Escape') {
            clearTaskSelection();
        }
    });
    
    // Click outside schedule to clear selection
    // Initialize flag if it doesn't exist
    if (typeof window.justFinishedDragSelect === 'undefined') {
        window.justFinishedDragSelect = false;
    }
    
    document.addEventListener('click', (e) => {
        // Don't clear if we just finished a drag-to-select
        if (window.justFinishedDragSelect) {
            window.justFinishedDragSelect = false;
            return;
        }
        
        if (!e.target.closest('.scheduled-task') && !e.target.closest('.baker-time-slot')) {
            clearTaskSelection();
        }
    });
}

// Setup resizable panel divider
function setupPanelResizer() {
    const resizer = document.getElementById('panel-resizer');
    const taskLibrary = document.querySelector('.task-library');
    const scheduleContainer = document.querySelector('.schedule-container');
    
    if (!resizer || !taskLibrary || !scheduleContainer) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = taskLibrary.offsetWidth;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const newWidth = startWidth + deltaX;
        const containerWidth = taskLibrary.parentElement.offsetWidth;
        const minWidth = 200;
        const maxWidth = containerWidth * 0.7; // Max 70% of container
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            taskLibrary.style.width = `${newWidth}px`;
            taskLibrary.style.flexShrink = '0';
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Save width to localStorage
            localStorage.setItem('taskLibraryWidth', taskLibrary.style.width);
        }
    });
    
    // Load saved width
    const savedWidth = localStorage.getItem('taskLibraryWidth');
    if (savedWidth) {
        taskLibrary.style.width = savedWidth;
    }
}

// Load default tasks (can be customized)
function loadDefaultTasks() {
    const defaultTasks = [
        // Preparation tasks
        { id: generateId(), name: 'Mix Dough', duration: 60, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Shape Bread', duration: 45, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Fold batch', duration: 20, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'preshape baguette', duration: 40, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Shape baguette', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Fill up 3 levain bucket', duration: 10, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Refresh levain', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Measuring futur mixes', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Shaping pastry 20 brioches braided', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Dividing pastry 30 brioche braided', duration: 30, productCount: null, category: 'Preparation' },
        
        // Baking tasks
        { id: generateId(), name: 'Bake Bread', duration: 30, productCount: null, category: 'Baking' },
        { id: generateId(), name: 'Unload bread batch', duration: 30, productCount: null, category: 'Baking' },
        { id: generateId(), name: 'Unload pastry batch', duration: 10, productCount: null, category: 'Baking' },
        { id: generateId(), name: 'Cool Products', duration: 20, productCount: null, category: 'Baking' },
        
        // Packaging tasks
        { id: generateId(), name: 'Package', duration: 30, productCount: null, category: 'Packaging' },
        
        // Cleaning tasks
        { id: generateId(), name: 'Clean Equipment', duration: 30, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Machine cleaning', duration: 20, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Dishes', duration: 20, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Clean end of day', duration: 30, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Check out / sanitize', duration: 10, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Check in / Sanitize', duration: 10, productCount: null, category: 'Cleaning' },
        
        // Other tasks
        { id: generateId(), name: 'Lunch', duration: 30, productCount: null, category: 'Other' },
        { id: generateId(), name: 'Coffee break', duration: 10, productCount: null, category: 'Other' },
        { id: generateId(), name: 'Buffer', duration: 10, productCount: null, category: 'Other' },
    ];
    state.tasks = defaultTasks;
    saveToStorage();
    renderTaskLibrary();
}

// Merge default tasks into existing tasks (adds missing ones)
function mergeDefaultTasks() {
    const defaultTasks = [
        // Preparation tasks
        { id: generateId(), name: 'Mix Dough', duration: 60, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Shape Bread', duration: 45, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Fold batch', duration: 20, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'preshape baguette', duration: 40, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Shape baguette', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Fill up 3 levain bucket', duration: 10, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Refresh levain', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Measuring futur mixes', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Shaping pastry 20 brioches braided', duration: 30, productCount: null, category: 'Preparation' },
        { id: generateId(), name: 'Dividing pastry 30 brioche braided', duration: 30, productCount: null, category: 'Preparation' },
        
        // Baking tasks
        { id: generateId(), name: 'Bake Bread', duration: 30, productCount: null, category: 'Baking' },
        { id: generateId(), name: 'Unload bread batch', duration: 30, productCount: null, category: 'Baking' },
        { id: generateId(), name: 'Unload pastry batch', duration: 10, productCount: null, category: 'Baking' },
        { id: generateId(), name: 'Cool Products', duration: 20, productCount: null, category: 'Baking' },
        
        // Packaging tasks
        { id: generateId(), name: 'Package', duration: 30, productCount: null, category: 'Packaging' },
        
        // Cleaning tasks
        { id: generateId(), name: 'Clean Equipment', duration: 30, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Machine cleaning', duration: 20, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Dishes', duration: 20, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Clean end of day', duration: 30, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Check out / sanitize', duration: 10, productCount: null, category: 'Cleaning' },
        { id: generateId(), name: 'Check in / Sanitize', duration: 10, productCount: null, category: 'Cleaning' },
        
        // Other tasks
        { id: generateId(), name: 'Lunch', duration: 30, productCount: null, category: 'Other' },
        { id: generateId(), name: 'Coffee break', duration: 10, productCount: null, category: 'Other' },
        { id: generateId(), name: 'Buffer', duration: 10, productCount: null, category: 'Other' },
    ];
    
    let addedCount = 0;
    defaultTasks.forEach(defaultTask => {
        const exists = state.tasks.some(t => t.name.toLowerCase() === defaultTask.name.toLowerCase());
        if (!exists) {
            state.tasks.push(defaultTask);
            addedCount++;
        }
    });
    
    // Ensure "Other" category exists
    if (!state.categories.includes('Other')) {
        state.categories.push('Other');
    }
    
    if (addedCount > 0) {
        saveToStorage();
        renderTaskLibrary();
        console.log(`Merged ${addedCount} default tasks`);
    }
}

// ============================================================================
// 3. EVENT LISTENERS
// ============================================================================

// Setup Event Listeners
function setupEventListeners() {
    // Date selector - opens a new tab or switches to existing one
    document.getElementById('schedule-date').addEventListener('change', (e) => {
        const newDate = e.target.value;
        openDateTab(newDate);
    });

    // Add task button
    // Add category button (now in header)
    document.getElementById('add-category-btn').addEventListener('click', () => {
        addCategory();
    });
    
    // Task library menu (import/export dropdown)
    const taskLibraryMenuBtn = document.getElementById('task-library-menu-btn');
    const taskLibraryMenu = document.getElementById('task-library-menu');
    
    taskLibraryMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        taskLibraryMenu.classList.toggle('active');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!taskLibraryMenu.contains(e.target) && e.target !== taskLibraryMenuBtn) {
            taskLibraryMenu.classList.remove('active');
        }
    });

    // Add baker button
    document.getElementById('add-baker-btn').addEventListener('click', () => {
        const bakers = getBakersForDate(state.currentDate);
        bakers.push(`Baker ${bakers.length + 1}`);
        saveToStorage();
        renderSchedule();
    });

    // View print button
    document.getElementById('view-print-btn').addEventListener('click', () => {
        showPrintView();
    });

    // Back to admin button
    document.getElementById('back-to-admin-btn').addEventListener('click', () => {
        showAdminView();
    });

    // Print button
    document.getElementById('print-btn').addEventListener('click', () => {
        window.print();
    });

    // Save template button
    document.getElementById('save-template-btn').addEventListener('click', () => {
        saveTemplate();
    });

    // Load template button
    document.getElementById('load-template-btn').addEventListener('click', () => {
        openTemplateModal('load');
    });

    // Export all data button
    document.getElementById('export-all-data-btn').addEventListener('click', () => {
        exportAllData();
    });

    // Import all data button
    const importAllDataInput = document.createElement('input');
    importAllDataInput.type = 'file';
    importAllDataInput.accept = '.json';
    importAllDataInput.style.display = 'none';
    importAllDataInput.addEventListener('change', importAllDataFromFile);
    document.body.appendChild(importAllDataInput);
    
    document.getElementById('import-all-data-btn').addEventListener('click', () => {
        importAllDataInput.click();
    });

    // Task form
    document.getElementById('task-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveTask();
    });

    // Baker form
    document.getElementById('baker-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveBaker();
    });

    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.modal'));
        });
    });

    document.getElementById('cancel-task-btn').addEventListener('click', () => {
        closeModal(document.getElementById('task-modal'));
    });

    document.getElementById('cancel-baker-btn').addEventListener('click', () => {
        closeModal(document.getElementById('baker-modal'));
    });

    document.getElementById('close-template-btn').addEventListener('click', () => {
        closeModal(document.getElementById('template-modal'));
    });

    // Delete task button
    document.getElementById('delete-task-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this task?')) {
            deleteTask();
        }
    });

    // Import tasks button (Excel/CSV)
    document.getElementById('import-tasks-btn').addEventListener('click', () => {
        importTasksFromExcel();
    });

    // Export tasks button
    document.getElementById('export-tasks-btn').addEventListener('click', () => {
        exportTasks();
    });

    // Import tasks from file button
    const importTasksFileInput = document.createElement('input');
    importTasksFileInput.type = 'file';
    importTasksFileInput.accept = '.json';
    importTasksFileInput.style.display = 'none';
    importTasksFileInput.addEventListener('change', importTasksFromFile);
    document.body.appendChild(importTasksFileInput);
    
    document.getElementById('import-tasks-file-btn').addEventListener('click', () => {
        importTasksFileInput.click();
    });


    // Scheduled task form
    const scheduledTaskForm = document.getElementById('scheduled-task-form');
    if (scheduledTaskForm) {
        scheduledTaskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveScheduledTask();
        });
    }

    const cancelScheduledTaskBtn = document.getElementById('cancel-scheduled-task-btn');
    if (cancelScheduledTaskBtn) {
        cancelScheduledTaskBtn.addEventListener('click', () => {
            closeModal(document.getElementById('scheduled-task-modal'));
            state.editingScheduledTask = null;
        });
    }

    // Click outside modal to close
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
            // Also clear editing state if closing scheduled task modal
            if (e.target.id === 'scheduled-task-modal') {
                state.editingScheduledTask = null;
            }
        }
    });
}

// ============================================================================
// 4. RENDERING FUNCTIONS
// ============================================================================

// Generate time slots (7am to 5:30pm, every 10 minutes)
function generateTimeSlots() {
    const slots = [];
    // 7am to 5:30pm
    for (let hour = 7; hour < 17; hour++) {
        for (let minute = 0; minute < 60; minute += 10) {
            const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            slots.push(time);
        }
    }
    // Add 5:00pm and 5:30pm
    slots.push('17:00');
    slots.push('17:30');
    return slots;
}

// Render Task Library
function renderTaskLibrary() {
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';

    // Group tasks by category
    const tasksByCategory = {};
    const uncategorized = [];

    state.tasks.forEach(task => {
        const category = task.category || '';
        if (category && state.categories.includes(category)) {
            if (!tasksByCategory[category]) {
                tasksByCategory[category] = [];
            }
            tasksByCategory[category].push(task);
        } else {
            uncategorized.push(task);
        }
    });
    
    // Sort tasks within each category by order (if set), otherwise maintain array order
    Object.keys(tasksByCategory).forEach(category => {
        tasksByCategory[category].sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
        });
    });
    // Sort uncategorized tasks
    uncategorized.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : Infinity;
        const orderB = b.order !== undefined ? b.order : Infinity;
        return orderA - orderB;
    });
    
    // Sort tasks within each category by order (if set), otherwise maintain array order
    Object.keys(tasksByCategory).forEach(category => {
        tasksByCategory[category].sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
        });
    });
    // Sort uncategorized tasks
    uncategorized.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : Infinity;
        const orderB = b.order !== undefined ? b.order : Infinity;
        return orderA - orderB;
    });

    // Render each category
    state.categories.forEach(category => {
        const categoryTasks = tasksByCategory[category] || [];
        // Always show categories, even if empty (user can organize tasks)

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'task-category';
        categoryDiv.dataset.category = category;

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'task-category-header';
        categoryHeader.draggable = true;
        categoryHeader.dataset.category = category;
        const isCollapsed = state.collapsedCategories.has(category);
        categoryHeader.innerHTML = `
            <span class="category-toggle">${isCollapsed ? '▶' : '▼'}</span>
            <span class="category-name">${category}</span>
            <div class="category-actions">
                <button class="category-add-task-btn" onclick="window.openTaskModal(null, '${category.replace(/'/g, "\\'")}'); event.stopPropagation(); return false;" title="Add Task to ${category.replace(/'/g, "\\'")}">+</button>
                <button class="category-rename-btn" onclick="renameCategory('${category}')" title="Rename">✏️</button>
                ${categoryTasks.length === 0 ? `<button class="category-delete-btn" onclick="deleteCategory('${category}')" title="Delete">×</button>` : ''}
            </div>
        `;
        
        // Add click handler to toggle collapse (but not when clicking buttons)
        categoryHeader.addEventListener('click', (e) => {
            // Don't toggle if clicking on buttons or dragging
            if (e.target.closest('button') || e.target.closest('.category-actions')) {
                return;
            }
            if (window.draggingCategory) {
                return; // Don't toggle during drag
            }
            toggleCategoryCollapse(category);
        });
        
        // Make category header draggable for reordering
        categoryHeader.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('category-drag', category);
            categoryHeader.classList.add('dragging');
            // Store in window for dragover access
            window.draggingCategory = category;
        });
        
        categoryHeader.addEventListener('dragend', () => {
            categoryHeader.classList.remove('dragging');
            window.draggingCategory = null;
            document.querySelectorAll('.task-category.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
        });
        
        // Prevent drag when clicking buttons or toggle icon
        categoryHeader.querySelectorAll('button, .category-toggle').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                categoryHeader.draggable = false;
                setTimeout(() => {
                    categoryHeader.draggable = true;
                }, 100);
            });
        });
        
        // Make category container a drop zone
        categoryDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Check if we're dragging a category (use window variable since getData doesn't work in dragover)
            if (window.draggingCategory && window.draggingCategory !== category) {
                categoryDiv.classList.add('drag-over');
            }
        });
        
        categoryDiv.addEventListener('dragleave', (e) => {
            if (!categoryDiv.contains(e.relatedTarget)) {
                categoryDiv.classList.remove('drag-over');
            }
        });
        
        categoryDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            categoryDiv.classList.remove('drag-over');
            
            const draggedCategory = e.dataTransfer.getData('category-drag');
            if (draggedCategory && draggedCategory !== category) {
                // Reorder categories
                const draggedIndex = state.categories.indexOf(draggedCategory);
                const targetIndex = state.categories.indexOf(category);
                
                if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
                    // Remove from old position
                    state.categories.splice(draggedIndex, 1);
                    // Calculate new index (account for removal)
                    let newIndex = targetIndex;
                    if (draggedIndex < targetIndex) {
                        newIndex = targetIndex - 1;
                    }
                    // Insert at new position
                    state.categories.splice(newIndex, 0, draggedCategory);
                    
                    saveToStorage();
                    renderTaskLibrary();
                }
            }
        });

        const categoryTasksContainer = document.createElement('div');
        categoryTasksContainer.className = 'category-tasks';
        categoryTasksContainer.dataset.category = category;
        if (isCollapsed) {
            categoryTasksContainer.style.display = 'none';
            categoryDiv.classList.add('collapsed');
        }
        categoryTasksContainer.addEventListener('dragover', handleCategoryDragOver);
        categoryTasksContainer.addEventListener('drop', handleCategoryDrop);
        categoryTasksContainer.addEventListener('dragleave', handleCategoryDragLeave);
        
        // Add drag handlers for reordering tasks within category
        categoryTasksContainer.addEventListener('dragover', handleTaskReorderDragOver);
        categoryTasksContainer.addEventListener('drop', handleTaskReorderDrop);

        categoryTasks.forEach((task, index) => {
            const taskItem = createTaskLibraryItem(task, index);
            categoryTasksContainer.appendChild(taskItem);
        });
        
        categoryDiv.appendChild(categoryHeader);
        categoryDiv.appendChild(categoryTasksContainer);
        taskList.appendChild(categoryDiv);
    });

    // Render uncategorized tasks if any
    if (uncategorized.length > 0) {
        const uncategorizedDiv = document.createElement('div');
        uncategorizedDiv.className = 'task-category';
        uncategorizedDiv.dataset.category = '';

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'task-category-header';
        categoryHeader.draggable = true;
        categoryHeader.dataset.category = '';
        const isUncategorizedCollapsed = state.collapsedCategories.has('');
        categoryHeader.innerHTML = `
            <span class="category-toggle">${isUncategorizedCollapsed ? '▶' : '▼'}</span>
            <span class="category-name">Uncategorized</span>
            <div class="category-actions">
                <button class="category-add-task-btn" onclick="window.openTaskModal(null, ''); event.stopPropagation(); return false;" title="Add Task to Uncategorized">+</button>
            </div>
        `;
        
        // Add click handler to toggle collapse
        categoryHeader.addEventListener('click', (e) => {
            if (window.draggingCategory) {
                return; // Don't toggle during drag
            }
            toggleCategoryCollapse('');
        });
        
        // Make uncategorized header draggable (but it stays at the end, can't be reordered with categories)
        categoryHeader.addEventListener('dragstart', (e) => {
            e.preventDefault(); // Prevent dragging uncategorized
        });

        const categoryTasksContainer = document.createElement('div');
        categoryTasksContainer.className = 'category-tasks';
        categoryTasksContainer.dataset.category = '';
        if (isUncategorizedCollapsed) {
            categoryTasksContainer.style.display = 'none';
            uncategorizedDiv.classList.add('collapsed');
        }
        categoryTasksContainer.addEventListener('dragover', handleCategoryDragOver);
        categoryTasksContainer.addEventListener('drop', handleCategoryDrop);
        categoryTasksContainer.addEventListener('dragleave', handleCategoryDragLeave);
        
        // Add drag handlers for reordering tasks within category
        categoryTasksContainer.addEventListener('dragover', handleTaskReorderDragOver);
        categoryTasksContainer.addEventListener('drop', handleTaskReorderDrop);

        uncategorized.forEach((task, index) => {
            const taskItem = createTaskLibraryItem(task, index);
            categoryTasksContainer.appendChild(taskItem);
        });
        
        uncategorizedDiv.appendChild(categoryHeader);
        uncategorizedDiv.appendChild(categoryTasksContainer);
        taskList.appendChild(uncategorizedDiv);
    }
}

// Toggle category collapse state
function toggleCategoryCollapse(categoryName) {
    if (state.collapsedCategories.has(categoryName)) {
        state.collapsedCategories.delete(categoryName);
    } else {
        state.collapsedCategories.add(categoryName);
    }
    
    // Save to storage
    saveToStorage();
    
    // Re-render to update UI
    renderTaskLibrary();
}

// Create a task library item element
function createTaskLibraryItem(task, index) {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-item';
    taskItem.draggable = true;
    taskItem.dataset.taskId = task.id;
    taskItem.dataset.category = task.category || '';
    // Use task color if set, otherwise use default color
    const taskColor = task.color || state.taskColors[index % state.taskColors.length];
    taskItem.style.borderLeft = `4px solid ${taskColor}`;

    taskItem.innerHTML = `
        <div class="task-item-header">${task.name}</div>
        <div class="task-item-details">
            <span>${task.duration} min</span>
            ${task.productCount ? `<span>${task.productCount} products</span>` : ''}
        </div>
        ${task.description ? `<div class="task-item-description">${task.description}</div>` : ''}
        <div class="task-item-actions">
            <button onclick="editTask('${task.id}')">Edit</button>
        </div>
    `;

    taskItem.addEventListener('dragstart', handleDragStart);
    taskItem.addEventListener('dragend', handleDragEnd);
    
    // Double-click to edit task
    taskItem.addEventListener('dblclick', () => {
        editTask(task.id);
    });

    return taskItem;
}

// Render Schedule Tabs
function renderScheduleTabs() {
    const tabsContainer = document.getElementById('schedule-tabs');
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    
    // Add tabs for each open date
    state.openDates.forEach(date => {
        const tab = document.createElement('div');
        tab.className = `schedule-tab ${date === state.currentDate ? 'active' : ''}`;
        tab.dataset.date = date;
        
        // Parse date string (YYYY-MM-DD) to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day); // month is 0-indexed
        const dateStr = dateObj.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            weekday: 'short'
        });
        
        tab.innerHTML = `
            <span class="tab-label">${dateStr}</span>
            <button class="tab-close" onclick="closeDateTab('${date}')" title="Close tab">×</button>
        `;
        
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchToDate(date);
            }
        });
        
        tabsContainer.appendChild(tab);
    });
    
    // Add "+" button to open new date
    const addTab = document.createElement('div');
    addTab.className = 'schedule-tab-add';
    addTab.innerHTML = '+';
    addTab.title = 'Add new date';
    addTab.addEventListener('click', (e) => {
        // Create a temporary date input positioned near the + button
        const tempInput = document.createElement('input');
        tempInput.type = 'date';
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        tempInput.style.pointerEvents = 'none';
        tempInput.style.width = '1px';
        tempInput.style.height = '1px';
        
        // Position it near the + button
        const rect = addTab.getBoundingClientRect();
        tempInput.style.left = `${rect.left}px`;
        tempInput.style.top = `${rect.bottom + 5}px`;
        
        document.body.appendChild(tempInput);
        
        // Handle date selection
        tempInput.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            if (selectedDate) {
                openDateTab(selectedDate);
            }
            document.body.removeChild(tempInput);
        });
        
        // Handle cancel/close (when user clicks outside)
        const handleClickOutside = (event) => {
            if (!tempInput.contains(event.target) && event.target !== addTab) {
                document.body.removeChild(tempInput);
                document.removeEventListener('click', handleClickOutside);
            }
        };
        
        // Open the picker
        setTimeout(() => {
            if (tempInput.showPicker) {
                tempInput.showPicker().catch(() => {
                    tempInput.focus();
                    tempInput.click();
                });
            } else {
                tempInput.focus();
                tempInput.click();
            }
            // Listen for clicks outside to clean up
            setTimeout(() => {
                document.addEventListener('click', handleClickOutside);
            }, 100);
        }, 10);
    });
    tabsContainer.appendChild(addTab);
}

// Open a date tab (adds if not exists, switches if exists)
function openDateTab(date) {
    if (!state.openDates.includes(date)) {
        state.openDates.push(date);
    }
    switchToDate(date);
}

// Switch to a specific date
function switchToDate(date) {
    state.currentDate = date;
    document.getElementById('schedule-date').value = date;
    saveToStorage();
    renderScheduleTabs();
    renderSchedule();
}

// Close a date tab
function closeDateTab(date) {
    if (state.openDates.length <= 1) {
        alert('You must have at least one date tab open!');
        return;
    }
    
    const index = state.openDates.indexOf(date);
    if (index !== -1) {
        state.openDates.splice(index, 1);
        
        // If we closed the active tab, switch to another
        if (date === state.currentDate) {
            const newActiveDate = state.openDates[index > 0 ? index - 1 : 0];
            switchToDate(newActiveDate);
        } else {
            renderScheduleTabs();
        }
    }
}

// Clean up orphaned task instances (instances that don't have valid start times)
function cleanupOrphanedInstances() {
    const schedule = getScheduleForDate(state.currentDate);
    const timeSlots = generateTimeSlots();
    let cleaned = false;
    
    Object.keys(schedule).forEach(bakerIndex => {
        const bakerSchedule = schedule[bakerIndex];
        if (!bakerSchedule) return;
        
        // First pass: collect all valid instance start times (keep all valid times, not just current range)
        const validStartTimes = new Set();
        Object.keys(bakerSchedule).forEach(slotTime => {
            const instanceIdOrArray = bakerSchedule[slotTime];
            if (!instanceIdOrArray) return;
            
            const instances = Array.isArray(instanceIdOrArray) ? instanceIdOrArray : [instanceIdOrArray];
            instances.forEach(instanceId => {
                if (!instanceId) return;
                
                // Parse to get start time
                const parts = String(instanceId).split('|');
                if (parts.length >= 3) {
                    const startTime = parts[1];
                    // Keep all valid time formats, not just current range
                    const timePattern = /^\d{2}:\d{2}$/;
                    if (timePattern.test(startTime)) {
                        validStartTimes.add(startTime);
                    }
                } else {
                    const oldParts = String(instanceId).split('_');
                    if (oldParts.length >= 3) {
                        const startTime = oldParts[1];
                        const timePattern = /^\d{2}:\d{2}$/;
                        if (timePattern.test(startTime)) {
                            validStartTimes.add(startTime);
                        }
                    }
                }
            });
        });
        
        // Second pass: remove instances that don't start at valid times or are orphans
        Object.keys(bakerSchedule).forEach(slotTime => {
            const instanceIdOrArray = bakerSchedule[slotTime];
            if (!instanceIdOrArray) return;
            
            const instances = Array.isArray(instanceIdOrArray) ? instanceIdOrArray : [instanceIdOrArray];
            const validInstances = instances.filter(instanceId => {
                if (!instanceId) return false;
                
                // Parse instance ID
                const parts = String(instanceId).split('|');
                let startTime, taskId;
                if (parts.length >= 3) {
                    [taskId, startTime] = [parts[0], parts[1]];
                } else {
                    const oldParts = String(instanceId).split('_');
                    if (oldParts.length >= 3) {
                        [taskId, startTime] = [oldParts[0], oldParts[1]];
                    } else {
                        return false; // Invalid format
                    }
                }
                
                // Check if task exists - only remove if task doesn't exist
                if (!state.tasks.find(t => t.id === taskId)) return false;
                
                // Check if it's a valid time format (HH:MM) - be lenient
                // Don't remove tasks just because they're outside current time range
                const timePattern = /^\d{2}:\d{2}$/;
                if (!timePattern.test(startTime)) return false;
                
                // Keep the instance - even if it's outside current time range
                // The user might change the time range back or use it for other dates
                return true;
            });
            
            // Update slot
            if (validInstances.length === 0) {
                delete bakerSchedule[slotTime];
                cleaned = true;
            } else if (validInstances.length === 1) {
                if (instanceIdOrArray !== validInstances[0]) {
                    bakerSchedule[slotTime] = validInstances[0];
                    cleaned = true;
                }
            } else {
                // Remove duplicates
                const uniqueInstances = Array.from(new Set(validInstances));
                if (uniqueInstances.length !== instances.length) {
                    bakerSchedule[slotTime] = uniqueInstances;
                    cleaned = true;
                } else if (!uniqueInstances.every((id, i) => id === instances[i])) {
                    bakerSchedule[slotTime] = uniqueInstances;
                    cleaned = true;
                }
            }
        });
    });
    
    if (cleaned) {
        saveToStorage();
    }
    
    return cleaned;
}

// Render Schedule
function renderSchedule() {
    // Temporarily disable cleanup to prevent data loss
    // cleanupOrphanedInstances();
    
    const timeSlots = generateTimeSlots();
    const scheduleGrid = document.getElementById('schedule-grid');
    const bakerHeaders = document.getElementById('baker-headers');

    // Clear existing
    scheduleGrid.innerHTML = '';
    bakerHeaders.innerHTML = '';

    // Render baker headers (date-specific)
    const bakers = getBakersForDate(state.currentDate);
    bakers.forEach((baker, index) => {
        const header = document.createElement('div');
        header.className = 'baker-header';
        header.innerHTML = `
            <div class="baker-name">${baker}</div>
            <button class="baker-rename-btn" onclick="renameBaker(${index})" title="Rename">✏️</button>
            ${bakers.length > 1 ? `<button class="baker-delete-btn" onclick="deleteBaker(${index})" title="Delete">×</button>` : ''}
        `;
        bakerHeaders.appendChild(header);
    });

    // Render time column
    const timeColumn = document.createElement('div');
    timeColumn.className = 'time-column';
    timeSlots.forEach(time => {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = time;
        timeColumn.appendChild(timeSlot);
    });
    scheduleGrid.appendChild(timeColumn);

    // Render baker columns
    const bakerColumns = document.createElement('div');
    bakerColumns.className = 'baker-columns-grid';

    bakers.forEach((baker, bakerIndex) => {
        const bakerColumn = document.createElement('div');
        bakerColumn.className = 'baker-column';
        bakerColumn.dataset.bakerIndex = bakerIndex;

        // Create a container for tasks with relative positioning
        const taskContainer = document.createElement('div');
        taskContainer.className = 'baker-task-container';
        taskContainer.dataset.bakerIndex = bakerIndex;

        // Render empty time slots for drop zones
        timeSlots.forEach((time, timeIndex) => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'baker-time-slot';
            timeSlot.dataset.bakerIndex = bakerIndex;
            timeSlot.dataset.time = time;
            timeSlot.dataset.timeIndex = timeIndex;

            // Make sure drop zones can receive events even when tasks are on top
            timeSlot.addEventListener('dragover', handleDragOver);
            timeSlot.addEventListener('drop', handleDrop);
            timeSlot.addEventListener('dragleave', handleDragLeave);

            bakerColumn.appendChild(timeSlot);
        });

        // Render scheduled tasks with Google Calendar-style overlapping
        const schedule = getScheduleForDate(state.currentDate);
        const bakerSchedule = schedule[bakerIndex] || {};
        
        // First pass: Collect all tasks with their time ranges
        const taskInstances = [];
        const instanceMap = new Map();
        
        timeSlots.forEach((time, timeIndex) => {
            const instanceIdOrArray = bakerSchedule[time];
            if (!instanceIdOrArray) return;

            const instanceIds = Array.isArray(instanceIdOrArray) ? instanceIdOrArray : [instanceIdOrArray];
            
            instanceIds.forEach(instanceId => {
                if (instanceMap.has(instanceId)) return;
                
                let parts = instanceId.split('|');
                let taskId, instanceStartTime, instanceBakerIndex;
                
                if (parts.length >= 4) {
                    [taskId, instanceStartTime, instanceBakerIndex] = [parts[0], parts[1], parseInt(parts[2])];
                } else {
                    parts = instanceId.split('_');
                    if (parts.length < 3) return;
                    [taskId, instanceStartTime, instanceBakerIndex] = [parts[0], parts[1], parseInt(parts[2])];
                }
                
                if (instanceStartTime !== time || instanceBakerIndex !== bakerIndex) return;
                
                const task = state.tasks.find(t => t.id === taskId);
                if (!task) return;
                
                let actualDuration = task.duration;
                if (instanceId && state.scheduledTaskInstances[instanceId]) {
                    const instanceProps = state.scheduledTaskInstances[instanceId];
                    if (instanceProps && instanceProps.duration !== undefined) {
                        actualDuration = instanceProps.duration;
                    }
                }
                
                const startTimeIndex = timeSlots.indexOf(instanceStartTime);
                const durationSlots = Math.ceil(actualDuration / 10);
                const endTimeIndex = Math.min(startTimeIndex + durationSlots - 1, timeSlots.length - 1);
                
                taskInstances.push({
                    instanceId,
                    taskId,
                    task,
                    startTime: instanceStartTime,
                    startTimeIndex,
                    endTimeIndex,
                    durationSlots,
                    actualDuration,
                    bakerIndex
                });
                
                instanceMap.set(instanceId, true);
            });
        });
        
        // Second pass: Calculate overlap groups and positions for each task
        taskInstances.forEach(taskInstance => {
            let maxOverlaps = 1;
            let overlapGroup = [];
            
            // Check each slot this task occupies to find maximum overlap
            for (let slotIndex = taskInstance.startTimeIndex; slotIndex <= taskInstance.endTimeIndex; slotIndex++) {
                if (slotIndex >= timeSlots.length) break;
                const slotTime = timeSlots[slotIndex];
                const slotInstances = bakerSchedule[slotTime];
                if (!slotInstances) continue;
                
                // Find all tasks that overlap at this slot
                const overlappingTasks = taskInstances.filter(otherTask => {
                    return otherTask.startTimeIndex <= slotIndex && otherTask.endTimeIndex >= slotIndex;
                });
                
                if (overlappingTasks.length > maxOverlaps) {
                    maxOverlaps = overlappingTasks.length;
                    // Sort by start time, then by instanceId for consistency
                    overlapGroup = [...overlappingTasks].sort((a, b) => {
                        if (a.startTimeIndex !== b.startTimeIndex) {
                            return a.startTimeIndex - b.startTimeIndex;
                        }
                        return a.instanceId.localeCompare(b.instanceId);
                    });
                }
            }
            
            // If no overlap group found, use just this task
            if (overlapGroup.length === 0) {
                overlapGroup = [taskInstance];
            }
            
            // Find this task's position in the overlap group
            const positionInGroup = overlapGroup.findIndex(t => t.instanceId === taskInstance.instanceId);
            
            // Calculate width and left position (percentage-based)
            const widthPercent = 100 / maxOverlaps;
            const leftPercent = (positionInGroup * widthPercent);
            
            taskInstance.widthPercent = widthPercent;
            taskInstance.leftPercent = leftPercent;
            taskInstance.maxOverlaps = maxOverlaps;
        });
        
        // Third pass: Render tasks with calculated positions
        taskInstances.forEach(taskInstance => {
            const slotHeight = 24;
            const topPosition = taskInstance.startTimeIndex * slotHeight;
            const height = taskInstance.durationSlots * slotHeight;
            
            // Check for conflicts
            const hasConflict = checkTaskConflicts(
                taskInstance.instanceId, 
                taskInstance.startTime, 
                taskInstance.durationSlots, 
                timeSlots, 
                bakerSchedule
            );
            
            const taskElement = createScheduledTaskElement(
                taskInstance.task,
                taskInstance.startTime,
                taskInstance.startTimeIndex,
                bakerIndex,
                topPosition,
                height,
                hasConflict,
                taskInstance.instanceId,
                taskInstance.widthPercent,
                taskInstance.leftPercent
            );
            
            taskContainer.appendChild(taskElement);
            
            // Restore selection state after rendering
            if (state.selectedTasks.has(taskInstance.instanceId)) {
                taskElement.classList.add('selected');
            }
        });
        
        // Add drop handler to task container for better drop detection
        taskContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (window.draggingScheduledTask) {
                // Calculate which time slot we're over
                const rect = taskContainer.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const slotHeight = 24;
                const timeSlotIndex = Math.max(0, Math.min(timeSlots.length - 1, Math.floor(y / slotHeight)));
                const targetTime = timeSlots[timeSlotIndex];
                
                // Find and highlight the corresponding time slot
                const targetSlot = bakerColumn.querySelector(`.baker-time-slot[data-time="${targetTime}"]`);
                if (targetSlot) {
                    targetSlot.classList.add('drag-over');
                    // Remove highlight from other slots
                    bakerColumn.querySelectorAll('.baker-time-slot').forEach(slot => {
                        if (slot !== targetSlot) {
                            slot.classList.remove('drag-over');
                        }
                    });
                }
            }
        });
        
        taskContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (window.draggingScheduledTask) {
                // Calculate which time slot we dropped on
                const rect = taskContainer.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const slotHeight = 24;
                const timeSlotIndex = Math.max(0, Math.min(timeSlots.length - 1, Math.floor(y / slotHeight)));
                const targetTime = timeSlots[timeSlotIndex];
                
                // Find the target time slot and trigger its drop handler
                const targetSlot = bakerColumn.querySelector(`.baker-time-slot[data-time="${targetTime}"]`);
                if (targetSlot) {
                    // Get drag data
                    let dragData = null;
                    try {
                        dragData = e.dataTransfer.getData('scheduled-task');
                    } catch (err) {
                        // Fallback: try to get from window
                        if (window.draggedInstanceId) {
                            // Reconstruct drag data from instanceId
                            const parts = window.draggedInstanceId.split('|');
                            if (parts.length >= 4) {
                                dragData = JSON.stringify({
                                    taskId: parts[0],
                                    instanceId: window.draggedInstanceId,
                                    startTime: parts[1],
                                    bakerIndex: parseInt(parts[2])
                                });
                            }
                        }
                    }
                    
                    if (dragData) {
                        try {
                            const taskData = JSON.parse(dragData);
                            const { taskId, instanceId, startTime: oldStartTime, bakerIndex: oldBakerIndex } = taskData;
                            const newBakerIndex = parseInt(targetSlot.dataset.bakerIndex);
                            const newTime = targetSlot.dataset.time;
                            
                            // Check if this is a multi-select drag
                            if (taskData.multiSelect && taskData.tasks && Array.isArray(taskData.tasks)) {
                                // Calculate time offset from primary task
                                const primaryTask = taskData.primaryTask;
                                const timeSlots = generateTimeSlots();
                                const primaryTimeIndex = timeSlots.indexOf(primaryTask.startTime);
                                const targetTimeIndex = timeSlots.indexOf(newTime);
                                const timeOffset = targetTimeIndex - primaryTimeIndex;
                                
                                // Move all selected tasks maintaining relative positions
                                taskData.tasks.forEach(taskInfo => {
                                    const oldTimeIndex = timeSlots.indexOf(taskInfo.startTime);
                                    const newTimeIndex = oldTimeIndex + timeOffset;
                                    
                                    if (newTimeIndex >= 0 && newTimeIndex < timeSlots.length) {
                                        const finalTime = timeSlots[newTimeIndex];
                                        const finalBakerIndex = taskInfo.bakerIndex === primaryTask.bakerIndex ? newBakerIndex : taskInfo.bakerIndex;
                                        
                                        // Only move if it's a different time or baker
                                        if (taskInfo.startTime !== finalTime || taskInfo.bakerIndex !== finalBakerIndex) {
                                            // Preserve ALL instance-specific properties
                                            let oldInstanceProps = null;
                                            if (taskInfo.instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[taskInfo.instanceId]) {
                                                oldInstanceProps = { ...state.scheduledTaskInstances[taskInfo.instanceId] };
                                            }
                                            
                                            // Remove from old position
                                            removeScheduledTaskFromData(taskInfo.startTime, taskInfo.bakerIndex, null, taskInfo.instanceId);
                                            
                                            // Add to new position
                                            const newInstanceId = addScheduledTask(taskInfo.taskId, finalTime, finalBakerIndex);
                                            
                                            // Copy ALL instance properties to new instance (customName, duration, productCount, description, color)
                                            if (newInstanceId && oldInstanceProps) {
                                                if (!state.scheduledTaskInstances) {
                                                    state.scheduledTaskInstances = {};
                                                }
                                                if (!state.scheduledTaskInstances[newInstanceId]) {
                                                    state.scheduledTaskInstances[newInstanceId] = {};
                                                }
                                                // Copy all properties from old instance to new instance
                                                Object.keys(oldInstanceProps).forEach(key => {
                                                    if (oldInstanceProps[key] !== undefined) {
                                                        state.scheduledTaskInstances[newInstanceId][key] = oldInstanceProps[key];
                                                    }
                                                });
                                            }
                                        }
                                    }
                                });
                                
                                // Clear selection after moving
                                clearTaskSelection();
                                saveToStorage();
                                renderSchedule();
                            } else {
                                // Single task drag
                                // Only move if it's a different time or baker
                                if (oldStartTime !== newTime || oldBakerIndex !== newBakerIndex) {
                                    // Preserve ALL instance-specific properties
                                    let oldInstanceProps = null;
                                    if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
                                        oldInstanceProps = { ...state.scheduledTaskInstances[instanceId] };
                                    }
                                    
                                    // Remove from old position using instanceId
                                    removeScheduledTaskFromData(oldStartTime, oldBakerIndex, null, instanceId);
                                    // Add to new position (creates new instance)
                                    const newInstanceId = addScheduledTask(taskId, newTime, newBakerIndex);
                                    
                                    // Copy ALL instance properties to new instance (customName, duration, productCount, description, color)
                                    if (newInstanceId && oldInstanceProps) {
                                        if (!state.scheduledTaskInstances) {
                                            state.scheduledTaskInstances = {};
                                        }
                                        if (!state.scheduledTaskInstances[newInstanceId]) {
                                            state.scheduledTaskInstances[newInstanceId] = {};
                                        }
                                        // Copy all properties from old instance to new instance
                                        Object.keys(oldInstanceProps).forEach(key => {
                                            if (oldInstanceProps[key] !== undefined) {
                                                state.scheduledTaskInstances[newInstanceId][key] = oldInstanceProps[key];
                                            }
                                        });
                                    }
                                    
                                    saveToStorage();
                                    // Re-render the schedule
                                    renderSchedule();
                                }
                            }
                        } catch (err) {
                            console.error('Error parsing drag data:', err);
                        }
                    }
                    
                    // Clear drag over classes
                    bakerColumn.querySelectorAll('.baker-time-slot').forEach(slot => {
                        slot.classList.remove('drag-over');
                    });
                }
            }
        });
        
        taskContainer.addEventListener('dragleave', (e) => {
            // Only clear if we're actually leaving the container (not just moving between children)
            const relatedTarget = e.relatedTarget;
            if (!taskContainer.contains(relatedTarget)) {
                // Clear all highlights
                bakerColumn.querySelectorAll('.baker-time-slot').forEach(slot => {
                    slot.classList.remove('drag-over');
                });
            }
        });

        bakerColumn.appendChild(taskContainer);
        bakerColumns.appendChild(bakerColumn);
    });

    scheduleGrid.appendChild(bakerColumns);
    
    // Re-add selection box if it was removed during render
    if (!document.getElementById('selection-box')) {
        const selectionBox = document.createElement('div');
        selectionBox.id = 'selection-box';
        selectionBox.className = 'selection-box';
        selectionBox.style.display = 'none';
        scheduleGrid.appendChild(selectionBox);
    }
    
    // Setup drag-to-select functionality
    setupDragToSelect();
}

// Setup drag-to-select (selection box)
function setupDragToSelect() {
    const scheduleGrid = document.getElementById('schedule-grid');
    
    if (!scheduleGrid) return;
    
    // Ensure selection box exists
    let selectionBox = document.getElementById('selection-box');
    if (!selectionBox) {
        selectionBox = document.createElement('div');
        selectionBox.id = 'selection-box';
        selectionBox.className = 'selection-box';
        selectionBox.style.display = 'none';
        scheduleGrid.appendChild(selectionBox);
    }
    
    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let justFinishedDragSelect = false; // Flag to prevent click handler from clearing selection
    
    // Get all scheduled tasks for intersection checking
    function getAllScheduledTasks() {
        const tasks = [];
        scheduleGrid.querySelectorAll('.scheduled-task').forEach(taskEl => {
            const rect = taskEl.getBoundingClientRect();
            const gridRect = scheduleGrid.getBoundingClientRect();
            tasks.push({
                element: taskEl,
                instanceId: taskEl.dataset.instanceId,
                rect: {
                    left: rect.left - gridRect.left + scheduleGrid.scrollLeft,
                    top: rect.top - gridRect.top + scheduleGrid.scrollTop,
                    right: rect.right - gridRect.left + scheduleGrid.scrollLeft,
                    bottom: rect.bottom - gridRect.top + scheduleGrid.scrollTop,
                    width: rect.width,
                    height: rect.height
                }
            });
        });
        return tasks;
    }
    
    // Check if a task intersects with the selection box
    function taskIntersectsSelection(task, boxRect) {
        return !(task.rect.right < boxRect.left ||
                 task.rect.left > boxRect.right ||
                 task.rect.bottom < boxRect.top ||
                 task.rect.top > boxRect.bottom);
    }
    
    // Update selection box and highlight intersecting tasks
    function updateSelectionBox() {
        if (!isSelecting) return;
        
        // Ensure selection box exists
        if (!selectionBox || !selectionBox.parentNode) {
            const newBox = document.createElement('div');
            newBox.id = 'selection-box';
            newBox.className = 'selection-box';
            scheduleGrid.appendChild(newBox);
            selectionBox = newBox;
        }
        
        const gridRect = scheduleGrid.getBoundingClientRect();
        const left = Math.min(startX, currentX) - gridRect.left + scheduleGrid.scrollLeft;
        const top = Math.min(startY, currentY) - gridRect.top + scheduleGrid.scrollTop;
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        
        // Only show if there's a meaningful size
        if (width > 5 && height > 5) {
            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;
            selectionBox.style.display = 'block';
        } else {
            selectionBox.style.display = 'none';
        }
        
        // Check which tasks intersect with the selection box
        const boxRect = {
            left: Math.min(startX, currentX) - gridRect.left + scheduleGrid.scrollLeft,
            top: Math.min(startY, currentY) - gridRect.top + scheduleGrid.scrollTop,
            right: Math.max(startX, currentX) - gridRect.left + scheduleGrid.scrollLeft,
            bottom: Math.max(startY, currentY) - gridRect.top + scheduleGrid.scrollTop
        };
        
        const allTasks = getAllScheduledTasks();
        allTasks.forEach(task => {
            if (taskIntersectsSelection(task, boxRect)) {
                task.element.classList.add('selection-highlight');
            } else {
                task.element.classList.remove('selection-highlight');
            }
        });
    }
    
    // Start selection - use event delegation on schedule grid
    scheduleGrid.addEventListener('mousedown', (e) => {
        // Don't start selection if clicking on a task
        if (e.target.closest('.scheduled-task')) {
            return;
        }
        
        // Don't start selection if clicking on time column
        if (e.target.closest('.time-column') || e.target.closest('.time-slot')) {
            return;
        }
        
        // Don't start selection if clicking on baker header
        if (e.target.closest('.baker-header')) {
            return;
        }
        
        // Don't start selection if clicking on buttons or interactive elements
        if (e.target.tagName === 'BUTTON' || 
            e.target.closest('button') ||
            e.target.closest('.schedule-tabs')) {
            return;
        }
        
        // Only start if clicking on baker-time-slot (empty space) or baker-column
        const timeSlot = e.target.closest('.baker-time-slot');
        const bakerColumn = e.target.closest('.baker-column');
        
        if (!timeSlot && !bakerColumn) {
            return;
        }
        
        // Check if there's a task at this exact position (don't start if there is)
        if (timeSlot) {
            const rect = timeSlot.getBoundingClientRect();
            const taskAtPosition = Array.from(scheduleGrid.querySelectorAll('.scheduled-task')).find(task => {
                const taskRect = task.getBoundingClientRect();
                return e.clientX >= taskRect.left && e.clientX <= taskRect.right &&
                       e.clientY >= taskRect.top && e.clientY <= taskRect.bottom;
            });
            
            if (taskAtPosition) {
                return; // Don't start selection if clicking on a task
            }
        }
        
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;
        currentX = e.clientX;
        currentY = e.clientY;
        
        // Clear previous selection highlights
        scheduleGrid.querySelectorAll('.scheduled-task').forEach(task => {
            task.classList.remove('selection-highlight');
        });
        
        updateSelectionBox();
        e.preventDefault();
        e.stopPropagation();
    }, true); // Use capture phase to catch events before they bubble
    
    // Update selection box while dragging
    document.addEventListener('mousemove', (e) => {
        if (!isSelecting) return;
        
        currentX = e.clientX;
        currentY = e.clientY;
        updateSelectionBox();
        e.preventDefault();
    });
    
    // Finish selection
    document.addEventListener('mouseup', (e) => {
        if (!isSelecting) return;
        
        isSelecting = false;
        
        // Hide selection box immediately
        const box = document.getElementById('selection-box');
        if (box) {
            box.style.display = 'none';
            box.style.width = '0';
            box.style.height = '0';
        }
        
        // Get final selection box bounds
        const gridRect = scheduleGrid.getBoundingClientRect();
        const boxRect = {
            left: Math.min(startX, currentX) - gridRect.left + scheduleGrid.scrollLeft,
            top: Math.min(startY, currentY) - gridRect.top + scheduleGrid.scrollTop,
            right: Math.max(startX, currentX) - gridRect.left + scheduleGrid.scrollLeft,
            bottom: Math.max(startY, currentY) - gridRect.top + scheduleGrid.scrollTop
        };
        
        // Only proceed if we have a meaningful selection box size
        const boxWidth = Math.abs(currentX - startX);
        const boxHeight = Math.abs(currentY - startY);
        if (boxWidth < 5 || boxHeight < 5) {
            // Clear selection highlights
            scheduleGrid.querySelectorAll('.scheduled-task').forEach(task => {
                task.classList.remove('selection-highlight');
            });
            return;
        }
        
        // Select all tasks that intersect with the selection box
        const allTasks = getAllScheduledTasks();
        const selectedInstanceIds = new Set();
        
        allTasks.forEach(task => {
            if (taskIntersectsSelection(task, boxRect)) {
                selectedInstanceIds.add(task.instanceId);
                task.element.classList.remove('selection-highlight');
                task.element.classList.add('selected');
            } else {
                task.element.classList.remove('selection-highlight');
            }
        });
        
        // Update state.selectedTasks
        if (selectedInstanceIds.size > 0) {
            // If Ctrl/Cmd is held, add to selection; otherwise replace
            if (e.ctrlKey || e.metaKey) {
                selectedInstanceIds.forEach(id => state.selectedTasks.add(id));
            } else {
                clearTaskSelection();
                selectedInstanceIds.forEach(id => state.selectedTasks.add(id));
            }
            
            // Ensure visual selection is applied
            selectedInstanceIds.forEach(id => {
                const taskEl = scheduleGrid.querySelector(`[data-instance-id="${id}"]`)?.closest('.scheduled-task');
                if (taskEl) {
                    taskEl.classList.add('selected');
                }
            });
        } else if (!(e.ctrlKey || e.metaKey)) {
            // If no tasks selected and Ctrl/Cmd not held, clear selection
            clearTaskSelection();
        }
        
        // Set flag to prevent click handler from clearing selection immediately
        window.justFinishedDragSelect = true;
        setTimeout(() => {
            window.justFinishedDragSelect = false;
        }, 100);
        
        // Prevent event from bubbling to other handlers that might clear selection
        e.stopPropagation();
    });
}

// Check if a task instance has conflicts (overlaps with other instances)
function checkTaskConflicts(instanceId, startTime, durationSlots, timeSlots, bakerSchedule) {
    const startIndex = timeSlots.indexOf(startTime);
    if (startIndex === -1) return false;
    
    // Normalize the instanceId for comparison
    const normalizedInstanceId = String(instanceId).trim();
    
    // Parse this instance to get its core identifier (taskId|startTime|bakerIndex)
    // Format: taskId|startTime|bakerIndex|timestamp
    const thisInstanceParts = normalizedInstanceId.split('|');
    let thisTaskId, thisStartTime, thisBakerIndex;
    if (thisInstanceParts.length >= 3) {
        [thisTaskId, thisStartTime, thisBakerIndex] = [
            thisInstanceParts[0], 
            thisInstanceParts[1], 
            parseInt(thisInstanceParts[2])
        ];
    } else {
        // Try old format
        const oldParts = normalizedInstanceId.split('_');
        if (oldParts.length >= 3) {
            [thisTaskId, thisStartTime, thisBakerIndex] = [
                oldParts[0], 
                oldParts[1], 
                parseInt(oldParts[2])
            ];
        } else {
            // Can't parse, use exact match only
            thisTaskId = null;
        }
    }
    
    // Helper function to check if two instance IDs represent the same task instance
    // This must correctly identify when the same task instance appears in multiple slots
    const isSameInstance = (id1, id2) => {
        const str1 = String(id1).trim();
        const str2 = String(id2).trim();
        
        // Exact match (handles same instance ID exactly)
        if (str1 === str2) return true;
        
        // If we have parsed this instance, use that for comparison
        if (thisTaskId && thisStartTime && thisBakerIndex !== undefined) {
            const parts1 = str1.split('|');
            const parts2 = str2.split('|');
            if (parts1.length >= 3 && parts2.length >= 3) {
                // Compare taskId, startTime, and bakerIndex (ignore timestamp)
                if (parts1[0] === thisTaskId && parts1[1] === thisStartTime && parseInt(parts1[2]) === thisBakerIndex) {
                    return true;
                }
                if (parts2[0] === thisTaskId && parts2[1] === thisStartTime && parseInt(parts2[2]) === thisBakerIndex) {
                    return true;
                }
            }
            
            // Try old format
            const parts1Old = str1.split('_');
            const parts2Old = str2.split('_');
            if (parts1Old.length >= 3) {
                if (parts1Old[0] === thisTaskId && parts1Old[1] === thisStartTime && parseInt(parts1Old[2]) === thisBakerIndex) {
                    return true;
                }
            }
            if (parts2Old.length >= 3) {
                if (parts2Old[0] === thisTaskId && parts2Old[1] === thisStartTime && parseInt(parts2Old[2]) === thisBakerIndex) {
                    return true;
                }
            }
        }
        
        // Fallback: compare both IDs directly
        const parts1 = str1.split('|');
        const parts2 = str2.split('|');
        if (parts1.length >= 3 && parts2.length >= 3) {
            // Compare taskId, startTime, and bakerIndex (ignore timestamp)
            const same = parts1[0] === parts2[0] && 
                        parts1[1] === parts2[1] && 
                        parseInt(parts1[2]) === parseInt(parts2[2]);
            if (same) return true;
        }
        
        // Try old format: taskId_startTime_bakerIndex
        const parts1Old = str1.split('_');
        const parts2Old = str2.split('_');
        if (parts1Old.length >= 3 && parts2Old.length >= 3) {
            const same = parts1Old[0] === parts2Old[0] && 
                        parts1Old[1] === parts2Old[1] && 
                        parseInt(parts1Old[2]) === parseInt(parts2Old[2]);
            if (same) return true;
        }
        
        return false;
    };
    
    // Check each slot this task occupies
    for (let i = 0; i < durationSlots; i++) {
        const slotIndex = startIndex + i;
        if (slotIndex >= timeSlots.length) break;
        const slotTime = timeSlots[slotIndex];
        const instanceIdOrArray = bakerSchedule[slotTime];
        
        if (!instanceIdOrArray) {
            // Empty slot, no conflict
            continue;
        }
        
        // Convert to array for uniform processing
        const instancesInSlot = Array.isArray(instanceIdOrArray) 
            ? instanceIdOrArray 
            : [instanceIdOrArray];
        
        // Filter out invalid/empty entries and this instance itself
        // CRITICAL: We must filter out the same instance that appears in multiple slots
        const otherInstances = instancesInSlot.filter(id => {
            if (!id || String(id).trim() === '') return false;
            // Check if it's the same instance - if so, filter it out
            const isSame = isSameInstance(id, normalizedInstanceId);
            if (isSame) {
                // This is the same instance appearing in multiple slots (normal for multi-slot tasks)
                return false; // Filter it out
            }
            return true; // Keep only instances that are NOT the same
        });
        
        // If there are any OTHER instances (not this one) in this slot, we have a conflict
        if (otherInstances.length > 0) {
            // Debug: log conflict details (only in development)
            if (window.DEBUG_CONFLICTS) {
                console.log('Conflict detected:', {
                    instanceId: normalizedInstanceId,
                    thisInstance: { taskId: thisTaskId, startTime: thisStartTime, bakerIndex: thisBakerIndex },
                    slotTime: slotTime,
                    otherInstances: otherInstances,
                    allInstancesInSlot: instancesInSlot
                });
            }
            return true;
        }
    }
    
    return false;
}

// Create scheduled task element
function createScheduledTaskElement(task, startTime, startTimeIndex, bakerIndex, topPosition, height, hasConflict = false, instanceId = null, widthPercent = 100, leftPercent = 0) {
    // Create instance ID if not provided (for backward compatibility)
    if (!instanceId) {
        instanceId = `${task.id}_${startTime}_${bakerIndex}`;
    }
    
    const taskElement = document.createElement('div');
    taskElement.className = 'scheduled-task';
    if (hasConflict) {
        taskElement.classList.add('scheduled-task-conflict');
    }
    taskElement.dataset.taskId = task.id;
    taskElement.dataset.instanceId = instanceId;
    taskElement.dataset.bakerIndex = bakerIndex;
    taskElement.dataset.startTime = startTime;
    taskElement.dataset.startTimeIndex = startTimeIndex;
    taskElement.dataset.duration = task.duration;

    // Use task color if set, otherwise use default color
    const taskColor = task.color || state.taskColors[state.tasks.findIndex(t => t.id === task.id) % state.taskColors.length];
    taskElement.style.backgroundColor = taskColor;
    
    // Apply Google Calendar-style positioning for overlapping tasks
    const columnPadding = 2; // Padding from edges (percentage)
    const gapBetweenTasks = 0.5; // Gap between overlapping tasks (percentage)
    
    // Calculate width and left position
    const availableWidth = 100 - (columnPadding * 2);
    const taskWidth = (availableWidth * widthPercent / 100);
    const leftOffset = columnPadding + (availableWidth * leftPercent / 100);
    
    // Apply positioning
    taskElement.style.left = `${leftOffset}%`;
    taskElement.style.width = `${taskWidth}%`;
    taskElement.style.right = 'auto'; // Override right positioning
    
    // For 10-minute tasks (1 slot = 24px), align perfectly with small padding
    // For longer tasks, add small padding for visual separation
    const isShortTask = height <= 24;
    if (isShortTask) {
        // Perfect alignment for 10-minute tasks - use full height with border
        taskElement.style.height = `${height}px`;
        taskElement.style.top = `${topPosition}px`;
    } else {
        // Padding for longer tasks
        taskElement.style.height = `${height - 4}px`;
        taskElement.style.top = `${topPosition + 2}px`;
    }
    
    // Add min-height class for tasks that are tall enough to show description
    if (height >= 60) {
        taskElement.classList.add('min-height');
    }

    // Get actual duration - use instance duration if available, otherwise task default
    let actualDuration = task.duration;
    if (instanceId) {
        const instanceProps = state.scheduledTaskInstances[instanceId];
        if (instanceProps && instanceProps.duration !== undefined) {
            actualDuration = instanceProps.duration;
        }
    }
    
    // Get custom name if it exists (by instanceId)
    const customName = getCustomTaskName(instanceId);
    const displayName = customName || task.name;
    
    taskElement.innerHTML = `
        <div class="scheduled-task-resize-handle scheduled-task-resize-top" data-resize="top"></div>
        <div class="scheduled-task-content">
            ${hasConflict ? '<div class="scheduled-task-warning" title="⚠️ This task overlaps with another task">⚠️</div>' : ''}
            <div class="scheduled-task-header" data-editable="true">${displayName}</div>
            <div class="scheduled-task-details">
                ${formatTime(startTime)} - ${calculateEndTime(startTime, actualDuration)}
                ${(() => {
                    // Get product count from instance if available, otherwise from task
                    let productCount = task.productCount;
                    if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
                        const instanceProps = state.scheduledTaskInstances[instanceId];
                        if (instanceProps.productCount !== undefined) {
                            productCount = instanceProps.productCount;
                        }
                    }
                    return productCount ? ` • ${productCount} products` : '';
                })()}
            </div>
            ${(() => {
                // Get description from instance if available, otherwise from task
                let description = task.description;
                if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
                    const instanceProps = state.scheduledTaskInstances[instanceId];
                    if (instanceProps.description !== undefined) {
                        description = instanceProps.description;
                    }
                }
                return description ? `<div class="scheduled-task-description">${description}</div>` : '';
            })()}
            <div class="scheduled-task-actions">
                <button class="scheduled-task-edit" onclick="window.openScheduledTaskModal('${startTime}', ${bakerIndex}, '${task.id.replace(/'/g, "\\'")}', '${instanceId.replace(/'/g, "\\'")}'); event.stopPropagation(); return false;" title="Edit">✏️</button>
                <button class="scheduled-task-duplicate" onclick="window.duplicateScheduledTask('${startTime}', ${bakerIndex}, '${task.id.replace(/'/g, "\\'")}', '${instanceId.replace(/'/g, "\\'")}'); event.stopPropagation(); return false;" title="Duplicate">📋</button>
                <button class="scheduled-task-remove" onclick="removeScheduledTask('${startTime}', ${bakerIndex}, null, '${instanceId.replace(/'/g, "\\'")}')" title="Remove">×</button>
            </div>
        </div>
        <div class="scheduled-task-resize-handle scheduled-task-resize-bottom" data-resize="bottom"></div>
    `;

    // Make the task draggable (not the resize handles or buttons)
    taskElement.draggable = true;
    
    // Update selection state visually
    if (state.selectedTasks.has(instanceId)) {
        taskElement.classList.add('selected');
    }
    
    // Multi-select: Ctrl/Cmd+click to select multiple tasks
    // Use a flag to track if drag occurred
    let dragOccurred = false;
    
    taskElement.addEventListener('dragstart', () => {
        dragOccurred = true;
    });
    
    taskElement.addEventListener('dragend', () => {
        // Reset flag after a delay to allow click handler to check it
        setTimeout(() => {
            dragOccurred = false;
        }, 100);
    });
    
    taskElement.addEventListener('click', (e) => {
        // Don't handle click if a drag just occurred
        if (dragOccurred) {
            return;
        }
        
        // Don't select if clicking on buttons or handles
        const target = e.target;
        const isResizeHandle = target.classList.contains('scheduled-task-resize-handle') || 
                              target.closest('.scheduled-task-resize-handle');
        const isRemoveButton = target.classList.contains('scheduled-task-remove') ||
                              target.closest('.scheduled-task-remove');
        const isEditButton = target.classList.contains('scheduled-task-edit') ||
                            target.closest('.scheduled-task-edit');
        const isDuplicateButton = target.classList.contains('scheduled-task-duplicate') ||
                                 target.closest('.scheduled-task-duplicate');
        const isWarning = target.classList.contains('scheduled-task-warning') ||
                         target.closest('.scheduled-task-warning');
        
        if (isResizeHandle || isRemoveButton || isEditButton || isDuplicateButton || isWarning) {
            return; // Don't handle selection for these elements
        }
        
        // Ctrl/Cmd+click for multi-select
        if (e.ctrlKey || e.metaKey) {
            e.stopPropagation();
            
            if (state.selectedTasks.has(instanceId)) {
                // Deselect
                state.selectedTasks.delete(instanceId);
                taskElement.classList.remove('selected');
            } else {
                // Select
                state.selectedTasks.add(instanceId);
                taskElement.classList.add('selected');
            }
        } else {
            // Regular click - clear other selections if this one isn't selected
            if (!state.selectedTasks.has(instanceId)) {
                clearTaskSelection();
                state.selectedTasks.add(instanceId);
                taskElement.classList.add('selected');
            }
        }
    });
    
    // Prevent dragging when clicking resize handles, edit button, remove button, or warning
    const resizeHandles = taskElement.querySelectorAll('.scheduled-task-resize-handle');
    const removeButton = taskElement.querySelector('.scheduled-task-remove');
    const warningDiv = taskElement.querySelector('.scheduled-task-warning');
    const taskHeader = taskElement.querySelector('.scheduled-task-header');
    
    // Edit and duplicate buttons now use inline onclick handlers for better cross-browser compatibility
    // No event listeners needed - they're handled inline
    
    // Prevent dragging when clicking on buttons/handles (except edit/duplicate which handle it inline)
    [removeButton, warningDiv, ...resizeHandles].forEach(el => {
        if (el) {
            el.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                taskElement.draggable = false;
                // Reset after a short delay
                setTimeout(() => {
                    taskElement.draggable = true;
                }, 100);
            });
        }
    });

    taskElement.addEventListener('dragstart', (e) => {
        // Check if we're dragging from a resize handle, edit button, remove button, or warning
        const target = e.target;
        const isResizeHandle = target.classList.contains('scheduled-task-resize-handle') || 
                              target.closest('.scheduled-task-resize-handle');
        const isRemoveButton = target.classList.contains('scheduled-task-remove') ||
                              target.closest('.scheduled-task-remove');
        const isEditButton = target.classList.contains('scheduled-task-edit') ||
                            target.closest('.scheduled-task-edit');
        const isDuplicateButton = target.classList.contains('scheduled-task-duplicate') ||
                                 target.closest('.scheduled-task-duplicate');
        const isWarning = target.classList.contains('scheduled-task-warning') ||
                         target.closest('.scheduled-task-warning');
        
        // Only prevent if clicking directly on buttons/handles (not on their parent)
        // For edit and duplicate buttons, just stop propagation - don't prevent default
        // This allows their click handlers to fire properly
        if (isEditButton || isDuplicateButton) {
            e.stopPropagation();
            return false;
        }
        // For other buttons/handles, prevent default
        if (isResizeHandle || isRemoveButton || isWarning) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        
        // Make sure we're not interfering with library drags
        document.body.classList.remove('dragging-from-library');
        
        // Check if we have multiple tasks selected
        const selectedTasks = Array.from(state.selectedTasks);
        const isMultiSelect = selectedTasks.length > 1 && state.selectedTasks.has(instanceId);
        
        // Allow dragging from the task content area
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        
        if (isMultiSelect) {
            // Store all selected tasks for multi-drag
            const tasksToMove = selectedTasks.map(selectedInstanceId => {
                const selectedElement = document.querySelector(`[data-instance-id="${selectedInstanceId}"]`)?.closest('.scheduled-task');
                if (selectedElement) {
                    return {
                        instanceId: selectedInstanceId,
                        taskId: selectedElement.dataset.taskId,
                        startTime: selectedElement.dataset.startTime,
                        bakerIndex: parseInt(selectedElement.dataset.bakerIndex),
                        startTimeIndex: parseInt(selectedElement.dataset.startTimeIndex)
                    };
                }
                return null;
            }).filter(t => t !== null);
            
            e.dataTransfer.setData('scheduled-task', JSON.stringify({
                multiSelect: true,
                tasks: tasksToMove,
                primaryTask: {
                    taskId: task.id,
                    instanceId: instanceId,
                    startTime: startTime,
                    bakerIndex: bakerIndex,
                    startTimeIndex: startTimeIndex
                }
            }));
            
            // Show all selected tasks as dragging
            selectedTasks.forEach(selectedInstanceId => {
                const selectedElement = document.querySelector(`[data-instance-id="${selectedInstanceId}"]`)?.closest('.scheduled-task');
                if (selectedElement) {
                    selectedElement.style.opacity = '0.5';
                    selectedElement.classList.add('dragging');
                }
            });
        } else {
            // Single task drag
            e.dataTransfer.setData('scheduled-task', JSON.stringify({
                taskId: task.id,
                instanceId: instanceId,
                startTime: startTime,
                bakerIndex: bakerIndex,
                startTimeIndex: startTimeIndex
            }));
            taskElement.style.opacity = '0.5';
            taskElement.classList.add('dragging');
        }
        
        // Store reference for drop handling
        window.draggingScheduledTask = true;
        window.draggedInstanceId = instanceId;
        window.draggingMultipleTasks = isMultiSelect;
    });

    taskElement.addEventListener('dragend', (e) => {
        // Reset all dragging tasks
        document.querySelectorAll('.scheduled-task.dragging').forEach(el => {
            el.style.opacity = '1';
            el.classList.remove('dragging');
            el.draggable = true;
        });
        
        // Reset window flags after a small delay to allow drop handler to check them
        setTimeout(() => {
            window.draggingScheduledTask = false;
            window.draggedInstanceId = null;
            window.draggingMultipleTasks = false;
        }, 100);
        
        // Clear all drag-over highlights
        document.querySelectorAll('.baker-time-slot.drag-over').forEach(slot => {
            slot.classList.remove('drag-over');
        });
    });

    // Resize functionality
    setupTaskResize(taskElement, task, startTime, startTimeIndex, bakerIndex, instanceId);

    return taskElement;
}

// Setup resize handlers for a task
function setupTaskResize(taskElement, task, startTime, startTimeIndex, bakerIndex, instanceId) {
    let isResizing = false;
    let resizeType = null; // 'top' or 'bottom'
    let startY = 0;
    let startHeight = 0;
    let startTop = 0;
    
    // Get actual duration - use instance duration if available, otherwise task default
    let startDuration = task.duration;
    if (instanceId && state.scheduledTaskInstances[instanceId]) {
        const instanceProps = state.scheduledTaskInstances[instanceId];
        if (instanceProps.duration !== undefined) {
            startDuration = instanceProps.duration;
        }
    }

    const resizeHandles = taskElement.querySelectorAll('.scheduled-task-resize-handle');
    
    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            resizeType = handle.dataset.resize;
            startY = e.clientY;
            startHeight = taskElement.offsetHeight;
            startTop = parseInt(taskElement.style.top) || 0;
            
            // Get actual duration from instance or task
            startDuration = task.duration;
            if (instanceId && state.scheduledTaskInstances[instanceId]) {
                const instanceProps = state.scheduledTaskInstances[instanceId];
                if (instanceProps.duration !== undefined) {
                    startDuration = instanceProps.duration;
                }
            }

            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            
            taskElement.style.cursor = resizeType === 'top' ? 'ns-resize' : 'ns-resize';
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        });
    });

    function handleResize(e) {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const slotHeight = 24;
        const minutesPerSlot = 10;
        const deltaSlots = Math.round(deltaY / slotHeight);
        const deltaMinutes = deltaSlots * minutesPerSlot;

        let newDuration = startDuration;
        let newTop = startTop;
        let newStartTimeIndex = startTimeIndex;

        if (resizeType === 'bottom') {
            // Resize bottom - change duration (extend or shrink from bottom)
            newDuration = Math.max(10, startDuration + deltaMinutes);
        } else {
            // Resize top - change start time and duration (extend or shrink from top)
            const timeSlots = generateTimeSlots();
            const newIndex = Math.max(0, Math.min(timeSlots.length - 1, startTimeIndex + deltaSlots));
            const actualDeltaSlots = newIndex - startTimeIndex;
            const actualDeltaMinutes = actualDeltaSlots * minutesPerSlot;
            
            newDuration = Math.max(10, startDuration - actualDeltaMinutes);
            newStartTimeIndex = newIndex;
            newTop = startTop + (actualDeltaSlots * slotHeight);
        }

        // Update visual preview
        const timeSlots = generateTimeSlots();
        const newStartTime = timeSlots[newStartTimeIndex];
        const durationSlots = Math.ceil(newDuration / 10);
        const newHeight = durationSlots * 24; // slotHeight is already defined above

        if (resizeType === 'top') {
            taskElement.style.top = `${newTop}px`;
            taskElement.style.height = `${newHeight - 4}px`;
        } else {
            taskElement.style.height = `${newHeight - 4}px`;
        }

        // Update displayed time
        const timeDetails = taskElement.querySelector('.scheduled-task-details');
        if (timeDetails && newStartTime) {
            timeDetails.textContent = `${formatTime(newStartTime)} - ${calculateEndTime(newStartTime, newDuration)}${task.productCount ? ` • ${task.productCount} products` : ''}`;
        }
    }

    function stopResize(e) {
        if (!isResizing) return;

        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Calculate final values
        const deltaY = e.clientY - startY;
        const slotHeight = 24;
        const minutesPerSlot = 10;
        const deltaSlots = Math.round(deltaY / slotHeight);

        let newDuration = startDuration;
        let newStartTimeIndex = startTimeIndex;
        let newStartTime = startTime;
        const timeSlots = generateTimeSlots();

        if (resizeType === 'bottom') {
            const deltaMinutes = deltaSlots * minutesPerSlot;
            newDuration = Math.max(10, startDuration + deltaMinutes);
        } else {
            const newIndex = Math.max(0, Math.min(timeSlots.length - 1, startTimeIndex + deltaSlots));
            const actualDeltaSlots = newIndex - startTimeIndex;
            const actualDeltaMinutes = actualDeltaSlots * minutesPerSlot;
            
            newDuration = Math.max(10, startDuration - actualDeltaMinutes);
            newStartTimeIndex = newIndex;
            newStartTime = timeSlots[newStartTimeIndex];
        }

        // Update the schedule
        if (newDuration !== startDuration || newStartTime !== startTime) {
            // Get instanceId from taskElement
            const instanceId = taskElement.dataset.instanceId;
            const taskId = taskElement.dataset.taskId;
            
            // Preserve ALL instance properties before removing
            let oldInstanceProps = null;
            if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
                oldInstanceProps = { ...state.scheduledTaskInstances[instanceId] };
            }
            
            // Remove old instance
            removeScheduledTaskFromData(startTime, bakerIndex, taskId, instanceId);
            
            const finalStartTime = newStartTime || startTime;
            
            // Store instance-specific duration (don't modify task.duration)
            // This allows each instance to have its own duration
            if (!state.scheduledTaskInstances) {
                state.scheduledTaskInstances = {};
            }
            
            // Create new instance with updated duration
            const newInstanceId = addScheduledTask(taskId, finalStartTime, bakerIndex);
            
            // Copy ALL instance properties to new instance (customName, productCount, description, color, duration)
            if (newInstanceId && oldInstanceProps) {
                if (!state.scheduledTaskInstances[newInstanceId]) {
                    state.scheduledTaskInstances[newInstanceId] = {};
                }
                // Copy all properties from old instance, then update duration
                Object.keys(oldInstanceProps).forEach(key => {
                    if (oldInstanceProps[key] !== undefined) {
                        state.scheduledTaskInstances[newInstanceId][key] = oldInstanceProps[key];
                    }
                });
                // Update duration (may have changed)
                state.scheduledTaskInstances[newInstanceId].duration = newDuration;
            } else if (newInstanceId && newDuration !== task.duration) {
                // No old instance props, but duration is different from default
                if (!state.scheduledTaskInstances[newInstanceId]) {
                    state.scheduledTaskInstances[newInstanceId] = {};
                }
                state.scheduledTaskInstances[newInstanceId].duration = newDuration;
            }
            
            saveToStorage();
            renderSchedule();
        } else {
            // No change, just re-render to reset visuals
            renderSchedule();
        }
    }
}

// Drag and Drop Handlers
let draggedTaskId = null;

function handleDragStart(e) {
    draggedTaskId = e.target.dataset.taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    // Set data for category drop detection
    if (e.target.dataset.taskId) {
        e.dataTransfer.setData('task-library-item', e.target.dataset.taskId);
        // Store in window for dragover access (since getData doesn't work in dragover)
        window.draggingTaskFromLibrary = e.target.dataset.taskId;
        window.draggingTaskCategory = e.target.dataset.category || '';
    }
    // Add class to body to allow drops to pass through scheduled tasks
    document.body.classList.add('dragging-from-library');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedTaskId = null;
    window.draggingTaskFromLibrary = null;
    window.draggingTaskCategory = null;
    // Remove class from body
    document.body.classList.remove('dragging-from-library');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    // Check if dragging a scheduled task (move) or new task (copy)
    // Note: getData only works in drop event, so check window flag
    e.dataTransfer.dropEffect = window.draggingScheduledTask ? 'move' : 'copy';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const timeSlot = e.currentTarget;
    const bakerIndex = parseInt(timeSlot.dataset.bakerIndex);
    const time = timeSlot.dataset.time;

    // Check if dropping a new task or moving an existing one
    let data = null;
    try {
        data = e.dataTransfer.getData('scheduled-task');
    } catch (err) {
        // Sometimes getData fails, use window flag
        if (window.draggingScheduledTask && window.draggedInstanceId) {
            // Try to reconstruct from stored instanceId
            data = window.draggedInstanceId;
        }
    }
    
    if (data) {
        // Moving existing scheduled task instance(s)
        try {
            let taskData;
            if (typeof data === 'string' && data.startsWith('{')) {
                taskData = JSON.parse(data);
            } else {
                // Fallback: parse instanceId directly
                const parts = data.split('|');
                if (parts.length < 3) {
                    const oldParts = data.split('_');
                    if (oldParts.length >= 3) {
                        taskData = {
                            taskId: oldParts[0],
                            instanceId: data,
                            startTime: oldParts[1],
                            bakerIndex: parseInt(oldParts[2])
                        };
                    } else {
                        console.error('Invalid instance ID format:', data);
                        return;
                    }
                } else {
                    taskData = {
                        taskId: parts[0],
                        instanceId: data,
                        startTime: parts[1],
                        bakerIndex: parseInt(parts[2])
                    };
                }
            }
            
            // Check if this is a multi-select drag
            if (taskData.multiSelect && taskData.tasks && Array.isArray(taskData.tasks)) {
                // Calculate time offset from primary task
                const primaryTask = taskData.primaryTask;
                const timeSlots = generateTimeSlots();
                const primaryTimeIndex = timeSlots.indexOf(primaryTask.startTime);
                const targetTimeIndex = timeSlots.indexOf(time);
                const timeOffset = targetTimeIndex - primaryTimeIndex;
                
                // Move all selected tasks maintaining relative positions
                taskData.tasks.forEach(taskInfo => {
                    const oldTimeIndex = timeSlots.indexOf(taskInfo.startTime);
                    const newTimeIndex = oldTimeIndex + timeOffset;
                    
                    if (newTimeIndex >= 0 && newTimeIndex < timeSlots.length) {
                        const newTime = timeSlots[newTimeIndex];
                        const newBakerIndex = taskInfo.bakerIndex === primaryTask.bakerIndex ? bakerIndex : taskInfo.bakerIndex;
                        
                        // Only move if it's a different time or baker
                        if (taskInfo.startTime !== newTime || taskInfo.bakerIndex !== newBakerIndex) {
                            // Preserve ALL instance-specific properties
                            let oldInstanceProps = null;
                            if (taskInfo.instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[taskInfo.instanceId]) {
                                oldInstanceProps = { ...state.scheduledTaskInstances[taskInfo.instanceId] };
                            }
                            
                            // Remove from old position
                            removeScheduledTaskFromData(taskInfo.startTime, taskInfo.bakerIndex, null, taskInfo.instanceId);
                            
                            // Add to new position
                            const newInstanceId = addScheduledTask(taskInfo.taskId, newTime, newBakerIndex);
                            
                            // Copy ALL instance properties to new instance (customName, duration, productCount, description, color)
                            if (newInstanceId && oldInstanceProps) {
                                if (!state.scheduledTaskInstances) {
                                    state.scheduledTaskInstances = {};
                                }
                                if (!state.scheduledTaskInstances[newInstanceId]) {
                                    state.scheduledTaskInstances[newInstanceId] = {};
                                }
                                // Copy all properties from old instance to new instance
                                Object.keys(oldInstanceProps).forEach(key => {
                                    if (oldInstanceProps[key] !== undefined) {
                                        state.scheduledTaskInstances[newInstanceId][key] = oldInstanceProps[key];
                                    }
                                });
                            }
                        }
                    }
                });
                
                // Clear selection after moving
                clearTaskSelection();
                saveToStorage();
                renderSchedule();
            } else {
                // Single task drag (existing logic)
                const { taskId, instanceId, startTime: oldStartTime, bakerIndex: oldBakerIndex } = taskData;
                
                // Only move if it's a different time or baker
                if (oldStartTime !== time || oldBakerIndex !== bakerIndex) {
                    // Preserve ALL instance-specific properties
                    let oldInstanceProps = null;
                    if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
                        oldInstanceProps = { ...state.scheduledTaskInstances[instanceId] };
                    }
                    
                    // Remove from old position using instanceId
                    removeScheduledTaskFromData(oldStartTime, oldBakerIndex, null, instanceId);
                    // Add to new position (creates new instance)
                    const newInstanceId = addScheduledTask(taskId, time, bakerIndex);
                    
                    // Copy ALL instance properties to new instance (customName, duration, productCount, description, color)
                    if (newInstanceId && oldInstanceProps) {
                        if (!state.scheduledTaskInstances) {
                            state.scheduledTaskInstances = {};
                        }
                        if (!state.scheduledTaskInstances[newInstanceId]) {
                            state.scheduledTaskInstances[newInstanceId] = {};
                        }
                        // Copy all properties from old instance to new instance
                        Object.keys(oldInstanceProps).forEach(key => {
                            if (oldInstanceProps[key] !== undefined) {
                                state.scheduledTaskInstances[newInstanceId][key] = oldInstanceProps[key];
                            }
                        });
                    }
                    
                    saveToStorage();
                    // Re-render the schedule
                    renderSchedule();
                }
            }
        } catch (err) {
            console.error('Error parsing drag data:', err, data);
        }
    } else if (draggedTaskId) {
        // Adding new task from library
        addScheduledTask(draggedTaskId, time, bakerIndex);
        renderSchedule();
    }
    
    // Reset draggedTaskId
    draggedTaskId = null;
    window.draggingScheduledTask = false;
    window.draggedInstanceId = null;
}

// Category Drag and Drop Handlers
function handleCategoryDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('category-drag-over');
}

function handleCategoryDragLeave(e) {
    e.currentTarget.classList.remove('category-drag-over');
}

function handleCategoryDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('category-drag-over');

    const categoryContainer = e.currentTarget;
    const newCategory = categoryContainer.dataset.category || null;
    
    // Check if we're dropping a task from the library
    let taskId = e.dataTransfer.getData('task-library-item');
    
    // Fallback: try to find from dragging class
    if (!taskId) {
        const draggedElement = document.querySelector('.task-item.dragging');
        if (draggedElement) {
            taskId = draggedElement.dataset.taskId;
        }
    }
    
    if (taskId) {
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            task.category = newCategory || null;
            saveToStorage();
            renderTaskLibrary();
        }
    }
}

// Task reordering within category
function handleTaskReorderDragOver(e) {
    // Only handle if dragging a task item from the library (not from schedule)
    // Use window variable since getData doesn't work in dragover
    if (!window.draggingTaskFromLibrary) return;
    
    // Check if we're over a category-tasks container (not the schedule)
    if (!e.currentTarget.classList.contains('category-tasks')) return;
    
    // Only allow reordering within the same category
    const categoryContainer = e.currentTarget;
    const targetCategory = categoryContainer.dataset.category || '';
    if (window.draggingTaskCategory !== targetCategory) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const afterElement = getDragAfterElement(categoryContainer, e.clientY);
    const dragging = document.querySelector('.task-item.dragging');
    
    if (dragging && afterElement == null) {
        categoryContainer.appendChild(dragging);
    } else if (dragging && afterElement) {
        categoryContainer.insertBefore(dragging, afterElement);
    }
}

function handleTaskReorderDrop(e) {
    const draggedTaskId = e.dataTransfer.getData('task-library-item');
    if (!draggedTaskId) return;
    
    // Check if we're dropping in a category-tasks container (not the schedule)
    if (!e.currentTarget.classList.contains('category-tasks')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const categoryContainer = e.currentTarget;
    const category = categoryContainer.dataset.category || '';
    
    // Get all task items in this category in their new order
    const taskItems = Array.from(categoryContainer.querySelectorAll('.task-item'));
    const newOrder = taskItems.map((item, index) => ({
        taskId: item.dataset.taskId,
        order: index
    }));
    
    // Update order for all tasks in this category
    newOrder.forEach(({ taskId, order }) => {
        const task = state.tasks.find(t => t.id === taskId);
        if (task && (task.category || '') === category) {
            task.order = order;
        }
    });
    
    saveToStorage();
    renderTaskLibrary();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Category Management
function addCategory() {
    const name = prompt('Enter category name:');
    if (name && name.trim() !== '') {
        const trimmedName = name.trim();
        if (!state.categories.includes(trimmedName)) {
            state.categories.push(trimmedName);
            saveToStorage();
            renderTaskLibrary();
        } else {
            alert('Category already exists!');
        }
    }
}

function renameCategory(oldName) {
    const newName = prompt(`Rename category "${oldName}":`, oldName);
    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
        const trimmedName = newName.trim();
        if (!state.categories.includes(trimmedName)) {
            const index = state.categories.indexOf(oldName);
            if (index !== -1) {
                state.categories[index] = trimmedName;
                // Update all tasks with this category
                state.tasks.forEach(task => {
                    if (task.category === oldName) {
                        task.category = trimmedName;
                    }
                });
                saveToStorage();
                renderTaskLibrary();
                renderSchedule();
            }
        } else {
            alert('Category name already exists!');
        }
    }
}

function deleteCategory(categoryName) {
    if (confirm(`Delete category "${categoryName}"? Tasks in this category will become uncategorized.`)) {
        // Remove category
        state.categories = state.categories.filter(cat => cat !== categoryName);
        // Make tasks uncategorized
        state.tasks.forEach(task => {
            if (task.category === categoryName) {
                task.category = null;
            }
        });
        saveToStorage();
        renderTaskLibrary();
    }
}

// ============================================================================
// 5. SCHEDULE MANAGEMENT
// ============================================================================

// Schedule Management
function getScheduleForDate(date) {
    // Ensure state.schedule exists
    if (!state.schedule) {
        state.schedule = {};
    }
    // Ensure the date entry exists - IMPORTANT: don't overwrite if it already exists
    if (!state.schedule[date]) {
        state.schedule[date] = {};
    }
    // Return a reference to the existing schedule for this date
    // This ensures we're modifying the actual state, not a copy
    return state.schedule[date];
}

function addScheduledTask(taskId, startTime, bakerIndex) {
    // Ensure bakerIndex is a number
    bakerIndex = parseInt(bakerIndex);
    
    const schedule = getScheduleForDate(state.currentDate);
    if (!schedule[bakerIndex]) {
        schedule[bakerIndex] = {};
    }

    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return null;

    // Create unique instance identifier for this task placement
    // Use a separator that won't conflict with IDs or times
    const instanceId = `${taskId}|${startTime}|${bakerIndex}|${Date.now()}`;

    // Initialize scheduledTaskInstances if needed
    if (!state.scheduledTaskInstances) {
        state.scheduledTaskInstances = {};
    }

    // Get duration - check for instance-specific duration first
    let duration = task.duration;
    // Note: We can't check instance-specific duration here because this is a new instance
    // Instance-specific duration will be set after this function returns
    
    const durationSlots = Math.ceil(duration / 10);
    const timeSlots = generateTimeSlots();
    const startIndex = timeSlots.indexOf(startTime);
    
    // Validate startIndex
    if (startIndex === -1) {
        console.error('Invalid startTime:', startTime, 'not found in timeSlots');
        return null;
    }

    // Store task instance - allow overlapping and multiple instances of same task
    // Use instanceId to track unique placements
    for (let i = 0; i < durationSlots; i++) {
        const slotIndex = startIndex + i;
        if (slotIndex >= timeSlots.length) break;
        const slotTime = timeSlots[slotIndex];
        
        if (!schedule[bakerIndex][slotTime]) {
            // Empty slot - create array with this instance
            schedule[bakerIndex][slotTime] = [instanceId];
        } else {
            // Slot already has tasks
            if (Array.isArray(schedule[bakerIndex][slotTime])) {
                // Add this instance if not already present (check both exact match and parsed match)
                const alreadyPresent = schedule[bakerIndex][slotTime].some(id => {
                    if (id === instanceId) return true;
                    // Check parsed comparison
                    const idParts = String(id).split('|');
                    const checkParts = instanceId.split('|');
                    if (idParts.length >= 3 && checkParts.length >= 3) {
                        return idParts[0] === checkParts[0] && 
                               idParts[1] === checkParts[1] && 
                               parseInt(idParts[2]) === parseInt(checkParts[2]);
                    }
                    return false;
                });
                
                if (!alreadyPresent) {
                    schedule[bakerIndex][slotTime].push(instanceId);
                }
            } else {
                // Convert single instance to array
                const existingInstance = schedule[bakerIndex][slotTime];
                // Check if it's the same instance before adding
                if (existingInstance !== instanceId) {
                    schedule[bakerIndex][slotTime] = [existingInstance, instanceId];
                }
                // If same instance, leave as is
            }
        }
    }

    // Debug: Log after adding
    const taskCountAfter = Object.keys(schedule[bakerIndex]).reduce((count, time) => {
        const instances = schedule[bakerIndex][time];
        return count + (Array.isArray(instances) ? instances.length : 1);
    }, 0);
    console.log(`Adding task - After: ${taskCountAfter} tasks for baker ${bakerIndex}`);
    
    // Verify we're still modifying the actual state
    if (state.schedule[state.currentDate] !== schedule) {
        console.error('ERROR: Schedule reference lost! This will cause data loss!');
    }
    
    saveToStorage();
    return instanceId; // Return instanceId so caller can set instance-specific properties
}

function removeScheduledTask(startTime, bakerIndex, taskId = null, instanceId = null) {
    removeScheduledTaskFromData(startTime, bakerIndex, taskId, instanceId);
    renderSchedule();
}

function removeScheduledTaskFromData(startTime, bakerIndex, taskId = null, instanceId = null) {
    const schedule = getScheduleForDate(state.currentDate);
    if (!schedule[bakerIndex]) return;

    // If instanceId not provided, try to get it from the schedule
    if (!instanceId) {
        const instanceIdOrArray = schedule[bakerIndex][startTime];
        if (!instanceIdOrArray) return;
        
        // If it's an array, find the matching instance
        if (Array.isArray(instanceIdOrArray)) {
            // Try to find instance matching startTime and bakerIndex
            instanceId = instanceIdOrArray.find(id => {
                const parts = id.split('_');
                return parts[1] === startTime && parseInt(parts.slice(2).join('_')) === bakerIndex;
            }) || instanceIdOrArray[0];
        } else {
            instanceId = instanceIdOrArray;
        }
    }

    // Parse instanceId to get task info
    // Format: taskId|startTime|bakerIndex|timestamp or old: taskId_startTime_bakerIndex
    let parts = instanceId.split('|');
    let actualTaskId, actualStartTime;
    
    if (parts.length >= 4) {
        // New format: taskId|startTime|bakerIndex|timestamp
        actualTaskId = parts[0];
        actualStartTime = parts[1];
    } else {
        // Try old format: taskId_startTime_bakerIndex
        parts = instanceId.split('_');
        if (parts.length >= 3) {
            actualTaskId = parts[0];
            actualStartTime = parts[1];
        } else {
            // Fallback: create new instanceId if taskId provided
            if (taskId) {
                instanceId = `${taskId}|${startTime}|${bakerIndex}|${Date.now()}`;
                actualTaskId = taskId;
                actualStartTime = startTime;
            } else {
                return;
            }
        }
    }
    
    // Use the instanceId as-is for removal (don't modify it)
    const task = state.tasks.find(t => t.id === actualTaskId);
    if (!task) return;

    const durationSlots = Math.ceil(task.duration / 10);
    const timeSlots = generateTimeSlots();
    const startIndex = timeSlots.indexOf(actualStartTime);

    // Remove task instance from all time slots it occupies
    for (let i = 0; i < durationSlots; i++) {
        const slotIndex = startIndex + i;
        if (slotIndex >= timeSlots.length) break;
        const slotTime = timeSlots[slotIndex];
        const instanceIdOrArray = schedule[bakerIndex][slotTime];
        
        if (Array.isArray(instanceIdOrArray)) {
            // Remove from array - filter out this instance
            const filteredArray = instanceIdOrArray.filter(id => {
                // Exact match
                if (id === instanceId) return false;
                // Try parsing both IDs to compare
                const idParts = String(id).split('|');
                const checkParts = instanceId.split('|');
                if (idParts.length >= 3 && checkParts.length >= 3) {
                    // Compare taskId, startTime, and bakerIndex (ignore timestamp)
                    if (idParts[0] === checkParts[0] && 
                        idParts[1] === checkParts[1] && 
                        parseInt(idParts[2]) === parseInt(checkParts[2])) {
                        return false;
                    }
                }
                // Try old format
                const idPartsOld = String(id).split('_');
                const checkPartsOld = instanceId.split('_');
                if (idPartsOld.length >= 3 && checkPartsOld.length >= 3) {
                    if (idPartsOld[0] === checkPartsOld[0] && 
                        idPartsOld[1] === checkPartsOld[1] && 
                        parseInt(idPartsOld[2]) === parseInt(checkPartsOld[2])) {
                        return false;
                    }
                }
                return true; // Keep this instance
            });
            
            // Clean up empty entries
            const cleanedArray = filteredArray.filter(id => id && String(id).trim() !== '');
            
            if (cleanedArray.length === 0) {
                // No instances left, delete the slot
                delete schedule[bakerIndex][slotTime];
            } else if (cleanedArray.length === 1) {
                // Only one instance left, convert back to single value
                schedule[bakerIndex][slotTime] = cleanedArray[0];
            } else {
                // Multiple instances still remain, keep as array
                schedule[bakerIndex][slotTime] = cleanedArray;
            }
        } else if (instanceIdOrArray === instanceId) {
            // Exact match, delete the slot
            delete schedule[bakerIndex][slotTime];
        } else if (instanceIdOrArray) {
            // Check if it's the same instance but different format
            const otherParts = String(instanceIdOrArray).split('|');
            const checkParts = instanceId.split('|');
            if (otherParts.length >= 3 && checkParts.length >= 3) {
                // Compare taskId, startTime, and bakerIndex (ignore timestamp)
                if (otherParts[0] === checkParts[0] && 
                    otherParts[1] === checkParts[1] && 
                    parseInt(otherParts[2]) === parseInt(checkParts[2])) {
                    delete schedule[bakerIndex][slotTime];
                }
            }
        }
    }

    // Remove instance from scheduledTaskInstances (this also removes customName and other instance properties)
    if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
        delete state.scheduledTaskInstances[instanceId];
    }

    saveToStorage();
}

// Custom task name management - now stored by instanceId in scheduledTaskInstances
function getCustomTaskName(instanceId) {
    if (!instanceId || !state.scheduledTaskInstances || !state.scheduledTaskInstances[instanceId]) return null;
    return state.scheduledTaskInstances[instanceId].customName || null;
}

function setCustomTaskName(instanceId, customName) {
    if (!instanceId) return;
    if (!state.scheduledTaskInstances) {
        state.scheduledTaskInstances = {};
    }
    if (!state.scheduledTaskInstances[instanceId]) {
        state.scheduledTaskInstances[instanceId] = {};
    }
    if (customName && customName.trim() !== '') {
        state.scheduledTaskInstances[instanceId].customName = customName.trim();
    } else {
        delete state.scheduledTaskInstances[instanceId].customName;
    }
    saveToStorage();
}

// Legacy function for backward compatibility - tries to find instanceId from date/bakerIndex/startTime
function getCustomTaskNameLegacy(date, bakerIndex, startTime) {
    // Try to find instanceId from schedule
    const schedule = getScheduleForDate(date);
    if (schedule[bakerIndex] && schedule[bakerIndex][startTime]) {
        const instanceIdOrArray = schedule[bakerIndex][startTime];
        const instanceIds = Array.isArray(instanceIdOrArray) ? instanceIdOrArray : [instanceIdOrArray];
        // Find instance that matches this startTime and bakerIndex
        for (const instId of instanceIds) {
            const parts = String(instId).split('|');
            if (parts.length >= 3 && parts[1] === startTime && parseInt(parts[2]) === bakerIndex) {
                return getCustomTaskName(instId);
            }
            // Try old format
            const oldParts = String(instId).split('_');
            if (oldParts.length >= 3 && oldParts[1] === startTime && parseInt(oldParts[2]) === bakerIndex) {
                return getCustomTaskName(instId);
            }
        }
    }
    // Fallback to old customTaskNames structure for migration
    if (state.customTaskNames && state.customTaskNames[date] && state.customTaskNames[date][bakerIndex]) {
        return state.customTaskNames[date][bakerIndex][startTime] || null;
    }
    return null;
}

// Generate color shades (4 shades: light, medium-light, medium-dark, dark)
function generateColorShades(baseColor) {
    // Convert hex to RGB
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Generate 4 shades with better distribution
    // Row 0: Lightest (mix with white)
    // Row 1: Light (mix with white, less)
    // Row 2: Medium (original color)
    // Row 3: Dark (mix with black)
    const shades = [];
    
    // Lightest shade (70% white, 30% color)
    shades.push(`rgb(${Math.round(255 * 0.7 + r * 0.3)}, ${Math.round(255 * 0.7 + g * 0.3)}, ${Math.round(255 * 0.7 + b * 0.3)})`);
    
    // Light shade (40% white, 60% color)
    shades.push(`rgb(${Math.round(255 * 0.4 + r * 0.6)}, ${Math.round(255 * 0.4 + g * 0.6)}, ${Math.round(255 * 0.4 + b * 0.6)})`);
    
    // Medium shade (original color)
    shades.push(`rgb(${r}, ${g}, ${b})`);
    
    // Dark shade (70% color, 30% black)
    shades.push(`rgb(${Math.round(r * 0.7)}, ${Math.round(g * 0.7)}, ${Math.round(b * 0.7)})`);
    
    return shades;
}

// Render color picker with 4 shades per color
function renderColorPicker(containerId, selectedColor = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    // Create 4 rows (one for each shade level)
    for (let shadeIndex = 0; shadeIndex < 4; shadeIndex++) {
        const row = document.createElement('div');
        row.className = 'color-picker-row';
        
        state.taskColors.forEach((baseColor, colorIndex) => {
            const shades = generateColorShades(baseColor);
            const shadeColor = shades[shadeIndex];
            
            const colorOption = document.createElement('div');
            colorOption.className = 'color-option';
            colorOption.style.backgroundColor = shadeColor;
            colorOption.dataset.color = shadeColor;
            
            // Check if this shade matches the selected color
            if (selectedColor) {
                // Normalize both colors to RGB objects for comparison
                let selectedRgb = null;
                if (selectedColor.startsWith('#')) {
                    selectedRgb = hexToRgb(selectedColor);
                } else if (selectedColor.startsWith('rgb')) {
                    selectedRgb = rgbStringToRgb(selectedColor);
                }
                
                // Parse shade color to RGB
                const shadeRgb = rgbStringToRgb(shadeColor);
                
                // Compare RGB values with tolerance (allow small differences due to rounding)
                if (selectedRgb && shadeRgb) {
                    const tolerance = 2; // Allow 2 points difference per channel
                    const rDiff = Math.abs(selectedRgb.r - shadeRgb.r);
                    const gDiff = Math.abs(selectedRgb.g - shadeRgb.g);
                    const bDiff = Math.abs(selectedRgb.b - shadeRgb.b);
                    
                    if (rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance) {
                        colorOption.classList.add('selected');
                    }
                }
            }
            
            colorOption.addEventListener('click', function() {
                container.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
            });
            
            row.appendChild(colorOption);
        });
        
        container.appendChild(row);
    }
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    if (!hex || !hex.startsWith('#')) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Helper function to convert rgb() string to RGB object
function rgbStringToRgb(rgbString) {
    if (!rgbString || !rgbString.startsWith('rgb')) return null;
    const matches = rgbString.match(/\d+/g);
    return matches && matches.length === 3 ? {
        r: parseInt(matches[0]),
        g: parseInt(matches[1]),
        b: parseInt(matches[2])
    } : null;
}

// Open scheduled task edit modal
function openScheduledTaskModal(startTime, bakerIndex, taskId, instanceId = null) {
    state.editingScheduledTask = { startTime, bakerIndex, taskId, instanceId };
    
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }
    
    const modal = document.getElementById('scheduled-task-modal');
    const form = document.getElementById('scheduled-task-form');
    
    const schedule = getScheduleForDate(state.currentDate);
    const bakerSchedule = schedule[bakerIndex] || {};
    
    // Find the actual instanceId if not provided
    let actualInstanceId = instanceId;
    if (!actualInstanceId) {
        const instanceIdOrArray = bakerSchedule[startTime];
        if (instanceIdOrArray) {
            const instances = Array.isArray(instanceIdOrArray) ? instanceIdOrArray : [instanceIdOrArray];
            actualInstanceId = instances.find(id => {
                const parts = String(id).split('|');
                return parts.length >= 3 && parts[0] === taskId && parts[1] === startTime && parseInt(parts[2]) === bakerIndex;
            }) || instances[0];
        }
    }
    
    // Find the actual instance to get its properties (might be different from task default)
    let actualDuration = task.duration;
    let instanceProductCount = task.productCount;
    let instanceDescription = task.description;
    let instanceColor = task.color;
    let customName = null;
    
    // Get instance-specific properties if available
    if (actualInstanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[actualInstanceId]) {
        const instanceProps = state.scheduledTaskInstances[actualInstanceId];
        if (instanceProps.duration !== undefined) {
            actualDuration = instanceProps.duration;
        }
        if (instanceProps.productCount !== undefined) {
            instanceProductCount = instanceProps.productCount;
        }
        if (instanceProps.description !== undefined) {
            instanceDescription = instanceProps.description;
        }
        if (instanceProps.color !== undefined && instanceProps.color !== null) {
            instanceColor = instanceProps.color;
        }
        if (instanceProps.customName !== undefined) {
            customName = instanceProps.customName;
        }
    }
    
    // Fallback to legacy custom name lookup if not found in instance
    if (!customName && actualInstanceId) {
        customName = getCustomTaskNameLegacy(state.currentDate, bakerIndex, startTime);
    }
    
    // Populate form with instance-specific values (scheduled tasks are independent!)
    document.getElementById('scheduled-task-name').value = customName || task.name;
    document.getElementById('scheduled-task-start-time').value = startTime;
    document.getElementById('scheduled-task-duration').value = actualDuration;
    document.getElementById('scheduled-task-product-count').value = instanceProductCount || '';
    document.getElementById('scheduled-task-description').value = instanceDescription || '';
    
    // Render color picker with instance color
    renderColorPicker('scheduled-task-color-picker', instanceColor);
    
    modal.classList.add('active');
}

// Save scheduled task edits
function saveScheduledTask() {
    if (!state.editingScheduledTask) return;
    
    const { startTime, bakerIndex, taskId, instanceId } = state.editingScheduledTask;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const form = document.getElementById('scheduled-task-form');
    const newName = document.getElementById('scheduled-task-name').value.trim();
    const newDuration = parseInt(document.getElementById('scheduled-task-duration').value);
    const newProductCount = document.getElementById('scheduled-task-product-count').value;
    const newProductCountNum = newProductCount ? parseInt(newProductCount) : null;
    const newDescription = document.getElementById('scheduled-task-description').value.trim() || null;
    
    // Get selected color
    const colorPicker = document.getElementById('scheduled-task-color-picker');
    const selectedColorOption = colorPicker.querySelector('.color-option.selected');
    const newColor = selectedColorOption ? selectedColorOption.dataset.color : null;
    
    // Store ALL properties in instance (don't modify base task - scheduled tasks are independent!)
    if (!state.scheduledTaskInstances) {
        state.scheduledTaskInstances = {};
    }
    
    // Get or create instance properties
    let instanceProps = state.scheduledTaskInstances[instanceId];
    if (!instanceProps) {
        instanceProps = {};
        state.scheduledTaskInstances[instanceId] = instanceProps;
    }
    
    // Store instance-specific properties (independent from base task)
    if (newProductCountNum !== null && newProductCountNum !== task.productCount) {
        instanceProps.productCount = newProductCountNum;
    } else if (newProductCountNum === null && task.productCount === null) {
        // Remove if both are null
        delete instanceProps.productCount;
    }
    
    if (newDescription !== null && newDescription !== task.description) {
        instanceProps.description = newDescription;
    } else if (newDescription === null && task.description === null) {
        delete instanceProps.description;
    }
    
    // Always save color if one is selected, even if it matches task color
    // This ensures the color is stored and can be changed independently
    if (newColor !== null && newColor !== undefined) {
        instanceProps.color = newColor;
    } else {
        // If no color selected (null), remove instance color to fall back to task color
        delete instanceProps.color;
    }
    
    // Update custom name for this instance (stored by instanceId)
    // Always save the name if it's different from the original task name
    if (newName && newName.trim() !== '' && newName !== task.name) {
        instanceProps.customName = newName.trim();
    } else if (newName === task.name || newName.trim() === '') {
        // Remove custom name if it matches the original or is empty
        delete instanceProps.customName;
    }
    
    // Get current actual duration from instance or task
    let actualDuration = task.duration;
    if (instanceProps.duration !== undefined) {
        actualDuration = instanceProps.duration;
    }
    
    // If duration changed, we need to remove and re-add the task
    if (newDuration !== actualDuration) {
        // Get current instance properties to preserve them
        const currentInstanceProps = { ...instanceProps };
        
        // Remove old instance
        removeScheduledTaskFromData(startTime, bakerIndex, taskId, instanceId);
        
        // Add new instance with new duration
        const newInstanceId = addScheduledTask(taskId, startTime, bakerIndex);
        
        // Restore all instance properties to new instance
        if (newInstanceId) {
            if (!state.scheduledTaskInstances[newInstanceId]) {
                state.scheduledTaskInstances[newInstanceId] = {};
            }
            // Copy all properties except duration (which we're updating)
            Object.keys(currentInstanceProps).forEach(key => {
                if (key !== 'duration') {
                    state.scheduledTaskInstances[newInstanceId][key] = currentInstanceProps[key];
                }
            });
            state.scheduledTaskInstances[newInstanceId].duration = newDuration;
        }
    }
    
    saveToStorage();
    // Don't render task library - scheduled tasks are independent, don't affect base tasks
    renderSchedule();
    closeModal(document.getElementById('scheduled-task-modal'));
    state.editingScheduledTask = null;
}

// Duplicate a scheduled task
function duplicateScheduledTask(startTime, bakerIndex, taskId, instanceId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Get ALL instance properties if available
    let oldInstanceProps = null;
    if (instanceId && state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
        oldInstanceProps = { ...state.scheduledTaskInstances[instanceId] };
    }
    
    // Get duration for calculating new start time
    let instanceDuration = task.duration;
    if (oldInstanceProps && oldInstanceProps.duration !== undefined) {
        instanceDuration = oldInstanceProps.duration;
    }
    
    // Find next available time slot (10 minutes after the original task ends)
    const timeSlots = generateTimeSlots();
    const startTimeIndex = timeSlots.indexOf(startTime);
    const durationSlots = Math.ceil(instanceDuration / 10);
    const endTimeIndex = startTimeIndex + durationSlots;
    
    if (endTimeIndex >= timeSlots.length) {
        alert('Cannot duplicate: task would extend beyond available time slots.');
        return;
    }
    
    const newStartTime = timeSlots[endTimeIndex];
    
    // Add new instance
    const newInstanceId = addScheduledTask(taskId, newStartTime, bakerIndex);
    
    if (newInstanceId && oldInstanceProps) {
        // Copy ALL instance properties to the new instance (customName, duration, productCount, description, color)
        if (!state.scheduledTaskInstances) {
            state.scheduledTaskInstances = {};
        }
        if (!state.scheduledTaskInstances[newInstanceId]) {
            state.scheduledTaskInstances[newInstanceId] = {};
        }
        
        // Copy all properties from old instance to new instance
        Object.keys(oldInstanceProps).forEach(key => {
            if (oldInstanceProps[key] !== undefined) {
                state.scheduledTaskInstances[newInstanceId][key] = oldInstanceProps[key];
            }
        });
        
        saveToStorage();
        renderSchedule();
    }
}

// ============================================================================
// 6. TASK MANAGEMENT
// ============================================================================

// Task Management
function openTaskModal(taskId = null, preSelectCategory = null) {
    state.editingTask = taskId;
    const modal = document.getElementById('task-modal');
    const form = document.getElementById('task-form');
    const deleteBtn = document.getElementById('delete-task-btn');
    const modalTitle = document.getElementById('modal-title');

    // Update category dropdown
    const categorySelect = document.getElementById('task-category');
    categorySelect.innerHTML = '<option value="">Uncategorized</option>' + 
        state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    if (taskId) {
        const task = state.tasks.find(t => t.id === taskId);
        document.getElementById('task-name').value = task.name;
        document.getElementById('task-duration').value = task.duration;
        document.getElementById('task-description').value = task.description || '';
        categorySelect.value = task.category || '';
        deleteBtn.style.display = 'block';
        modalTitle.textContent = 'Edit Task';
        
        // Render color picker with task's color
        renderColorPicker('task-color-picker', task.color || null);
    } else {
        // New task - pre-select category if provided
        form.reset();
        if (preSelectCategory !== null) {
            categorySelect.value = preSelectCategory || '';
        } else {
            categorySelect.value = '';
        }
        deleteBtn.style.display = 'none';
        modalTitle.textContent = 'Add Task';
        
        // Render color picker with no selection
        renderColorPicker('task-color-picker');
    }

    modal.classList.add('active');
}

function saveTask() {
    const name = document.getElementById('task-name').value;
    const duration = parseInt(document.getElementById('task-duration').value);
    const description = document.getElementById('task-description').value.trim() || null;
    const category = document.getElementById('task-category').value || null;
    
    // Get selected color
    const colorPicker = document.getElementById('task-color-picker');
    const selectedColorOption = colorPicker.querySelector('.color-option.selected');
    const color = selectedColorOption ? selectedColorOption.dataset.color : null;

    if (state.editingTask) {
        const task = state.tasks.find(t => t.id === state.editingTask);
        task.name = name;
        task.duration = duration;
        task.description = description;
        task.category = category;
        task.color = color;
    } else {
        state.tasks.push({
            id: generateId(),
            name: name,
            duration: duration,
            description: description,
            category: category,
            color: color
        });
    }

    saveToStorage();
    renderTaskLibrary();
    renderSchedule();
    closeModal(document.getElementById('task-modal'));
}

function deleteTask() {
    const taskId = state.editingTask;
    state.tasks = state.tasks.filter(t => t.id !== taskId);

    // Remove from all schedules
    Object.keys(state.schedule).forEach(date => {
        Object.keys(state.schedule[date]).forEach(bakerIndex => {
            Object.keys(state.schedule[date][bakerIndex]).forEach(time => {
                if (state.schedule[date][bakerIndex][time] === taskId) {
                    delete state.schedule[date][bakerIndex][time];
                }
            });
        });
    });

    saveToStorage();
    renderTaskLibrary();
    renderSchedule();
    closeModal(document.getElementById('task-modal'));
}

function editTask(taskId) {
    openTaskModal(taskId);
}

// Expose functions to global scope for onclick handlers
window.editTask = editTask;
window.renameBaker = renameBaker;
window.deleteBaker = deleteBaker;
window.removeScheduledTask = removeScheduledTask;
window.openScheduledTaskModal = openScheduledTaskModal;
window.duplicateScheduledTask = duplicateScheduledTask;
window.saveScheduledTask = saveScheduledTask;
window.loadTemplate = loadTemplate;
window.deleteTemplate = deleteTemplate;
window.renameCategory = renameCategory;
window.deleteCategory = deleteCategory;
window.closeDateTab = closeDateTab;

// Baker Management (date-specific)
// Get bakers for a specific date, initializing with defaults if needed
function getBakersForDate(date) {
    if (!state.bakers[date]) {
        // Initialize with default bakers for this date
        state.bakers[date] = ['Baker 1', 'Baker 2'];
    }
    return state.bakers[date];
}

function renameBaker(bakerIndex) {
    state.editingBaker = bakerIndex;
    const modal = document.getElementById('baker-modal');
    const bakers = getBakersForDate(state.currentDate);
    document.getElementById('baker-name').value = bakers[bakerIndex];
    modal.classList.add('active');
}

function saveBaker() {
    const name = document.getElementById('baker-name').value;
    const bakers = getBakersForDate(state.currentDate);
    bakers[state.editingBaker] = name;
    saveToStorage();
    renderSchedule();
    closeModal(document.getElementById('baker-modal'));
}

// Delete a baker
function deleteBaker(bakerIndex) {
    const bakers = getBakersForDate(state.currentDate);
    
    if (bakers.length <= 1) {
        alert('You must have at least one baker!');
        return;
    }
    
    if (!confirm(`Delete "${bakers[bakerIndex]}"? All tasks scheduled for this baker will be removed.`)) {
        return;
    }
    
    // Remove the baker
    bakers.splice(bakerIndex, 1);
    
    // Remove all tasks for this baker from the schedule
    const schedule = getScheduleForDate(state.currentDate);
    if (schedule[bakerIndex]) {
        // Collect all instance IDs that need to be removed
        const instancesToRemove = new Set();
        Object.keys(schedule[bakerIndex]).forEach(time => {
            const instances = schedule[bakerIndex][time];
            const instanceArray = Array.isArray(instances) ? instances : [instances];
            instanceArray.forEach(instanceId => {
                if (typeof instanceId === 'string') {
                    instancesToRemove.add(instanceId);
                }
            });
        });
        
        // Remove instance properties
        instancesToRemove.forEach(instanceId => {
            if (state.scheduledTaskInstances[instanceId]) {
                delete state.scheduledTaskInstances[instanceId];
            }
        });
        
        // Remove the baker's schedule
        delete schedule[bakerIndex];
        
        // Shift all baker indices after the deleted one
        const newSchedule = {};
        Object.keys(schedule).forEach(oldIndex => {
            const oldIdx = parseInt(oldIndex);
            if (oldIdx > bakerIndex) {
                newSchedule[oldIdx - 1] = schedule[oldIndex];
            } else if (oldIdx < bakerIndex) {
                newSchedule[oldIdx] = schedule[oldIndex];
            }
        });
        
        // Update schedule for this date
        state.schedule[state.currentDate] = newSchedule;
        
        // Also update bakers array indices in the schedule
        // Need to update instance IDs that reference baker indices
        Object.keys(newSchedule).forEach(newBakerIndex => {
            Object.keys(newSchedule[newBakerIndex]).forEach(time => {
                const instances = newSchedule[newBakerIndex][time];
                const instanceArray = Array.isArray(instances) ? instances : [instances];
                const updatedInstances = instanceArray.map(instanceId => {
                    if (typeof instanceId === 'string') {
                        const parts = instanceId.split('|');
                        if (parts.length >= 4) {
                            const oldBakerIdx = parseInt(parts[2]);
                            if (oldBakerIdx > bakerIndex) {
                                // Update baker index in instance ID
                                parts[2] = (oldBakerIdx - 1).toString();
                                return parts.join('|');
                            }
                        }
                    }
                    return instanceId;
                });
                newSchedule[newBakerIndex][time] = updatedInstances.length === 1 ? updatedInstances[0] : updatedInstances;
            });
        });
        
        state.schedule[state.currentDate] = newSchedule;
    }
    
    saveToStorage();
    renderSchedule();
    syncHeaderScroll();
}

// Sync horizontal scroll between baker-name header row and the schedule grid.
// Both have a sticky 100px time column on the left, so scrollLeft maps 1:1.
// Uses scroll events + rAF polling as fallback (scroll events may not fire
// in all environments for programmatic scrollLeft changes).
function syncHeaderScroll() {
    const bakerHeaders = document.getElementById('baker-headers');
    const scheduleGrid = document.getElementById('schedule-grid');

    if (!bakerHeaders || !scheduleGrid) return;

    // Cancel previous rAF loop and listeners
    if (window._syncScrollRafId) cancelAnimationFrame(window._syncScrollRafId);
    if (scheduleGrid._scrollHandler) scheduleGrid.removeEventListener('scroll', scheduleGrid._scrollHandler);
    if (bakerHeaders._scrollHandler)  bakerHeaders.removeEventListener('scroll', bakerHeaders._scrollHandler);

    let syncing = false;

    scheduleGrid._scrollHandler = function() {
        if (syncing) return;
        syncing = true;
        bakerHeaders.scrollLeft = scheduleGrid.scrollLeft;
        syncing = false;
    };
    bakerHeaders._scrollHandler = function() {
        if (syncing) return;
        syncing = true;
        scheduleGrid.scrollLeft = bakerHeaders.scrollLeft;
        syncing = false;
    };

    scheduleGrid.addEventListener('scroll', scheduleGrid._scrollHandler);
    bakerHeaders.addEventListener('scroll', bakerHeaders._scrollHandler);

    // rAF polling — detects scrollLeft changes even when scroll events don't fire
    let prevGrid   = scheduleGrid.scrollLeft;
    let prevHeader = bakerHeaders.scrollLeft;

    function rafSync() {
        if (!syncing) {
            const gs = scheduleGrid.scrollLeft;
            const hs = bakerHeaders.scrollLeft;
            if (gs !== prevGrid) {
                prevGrid = gs;
                syncing = true;
                bakerHeaders.scrollLeft = gs;
                prevHeader = bakerHeaders.scrollLeft; // clamp-aware
                syncing = false;
            } else if (hs !== prevHeader) {
                prevHeader = hs;
                syncing = true;
                scheduleGrid.scrollLeft = hs;
                prevGrid = scheduleGrid.scrollLeft;
                syncing = false;
            }
        }
        window._syncScrollRafId = requestAnimationFrame(rafSync);
    }
    window._syncScrollRafId = requestAnimationFrame(rafSync);
}

// ============================================================================
// 7. TEMPLATE MANAGEMENT
// ============================================================================

// Template Management
function saveTemplate() {
    const name = prompt('Enter template name:');
    if (!name) return;

    const schedule = getScheduleForDate(state.currentDate);
    const customNames = state.customTaskNames[state.currentDate] || {};
    
    // Get scheduled task instances for this date
    // CRITICAL: The instance ID stored in the schedule IS the full instanceId string
    // Format: taskId|startTime|bakerIndex|timestamp
    const dateInstances = {};
    const instanceIdsInSchedule = new Set();
    
    // First, collect all instance IDs that are actually in the schedule
    Object.keys(schedule).forEach(bakerIndex => {
        Object.keys(schedule[bakerIndex] || {}).forEach(time => {
            const instances = schedule[bakerIndex][time];
            const instanceArray = Array.isArray(instances) ? instances : [instances];
            instanceArray.forEach(inst => {
                if (typeof inst === 'string') {
                    // The instance ID stored in the schedule IS the full instanceId
                    // So we can use it directly
                    instanceIdsInSchedule.add(inst);
                }
            });
        });
    });
    
    // Now, match instances from scheduledTaskInstances
    // Instance IDs in scheduledTaskInstances are the full strings (taskId|startTime|bakerIndex|timestamp)
    Object.keys(state.scheduledTaskInstances || {}).forEach(instanceId => {
        // Check if this instanceId appears in the schedule
        if (instanceIdsInSchedule.has(instanceId)) {
            // Deep copy to preserve all properties (duration, color, customName, etc.)
            dateInstances[instanceId] = JSON.parse(JSON.stringify(state.scheduledTaskInstances[instanceId]));
        }
    });
    
    state.templates[name] = {
        schedule: JSON.parse(JSON.stringify(schedule)),
        customTaskNames: JSON.parse(JSON.stringify(customNames)),
        scheduledTaskInstances: dateInstances,
        bakers: [...getBakersForDate(state.currentDate)],
        tasks: JSON.parse(JSON.stringify(state.tasks)), // Include tasks in template
        categories: [...state.categories], // Include categories in template
        date: new Date().toISOString()
    };

    saveToStorage();
    alert(`Template "${name}" saved!`);
}

function openTemplateModal(mode) {
    const modal = document.getElementById('template-modal');
    const templateList = document.getElementById('template-list');
    templateList.innerHTML = '';

    const templateNames = Object.keys(state.templates);
    
    if (templateNames.length === 0) {
        templateList.innerHTML = '<p>No templates saved yet.</p>';
    } else {
        templateNames.forEach(name => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.innerHTML = `
                <div class="template-item-name">${name}</div>
                <div class="template-item-actions">
                    ${mode === 'load' ? `<button class="btn btn-primary btn-small" onclick="loadTemplate('${name}')">Load</button>` : ''}
                    <button class="btn btn-secondary btn-small" onclick="exportTemplate('${name}')" title="Export to file">Export</button>
                    <button class="btn btn-danger btn-small" onclick="deleteTemplate('${name}')">Delete</button>
                </div>
            `;
            templateList.appendChild(item);
        });
    }

    modal.classList.add('active');
}

function loadTemplate(name) {
    const template = state.templates[name];
    if (!template) {
        alert(`Template "${name}" not found!`);
        return;
    }

    if (confirm(`Load template "${name}"? This will ADD tasks to the current schedule for ${state.currentDate} (existing tasks will remain).`)) {
        // Apply template bakers to current date if template has bakers
        if (template.bakers && Array.isArray(template.bakers)) {
            state.bakers[state.currentDate] = [...template.bakers];
        }
        
        const currentSchedule = getScheduleForDate(state.currentDate);
        const templateSchedule = template.schedule || {};
        
        // Merge template schedule into current schedule (don't replace)
        Object.keys(templateSchedule).forEach(bakerIndex => {
            const bakerIdx = parseInt(bakerIndex);
            if (!currentSchedule[bakerIdx]) {
                currentSchedule[bakerIdx] = {};
            }
            
            // Merge time slots for this baker
            Object.keys(templateSchedule[bakerIndex]).forEach(time => {
                const templateInstances = templateSchedule[bakerIndex][time];
                if (Array.isArray(templateInstances)) {
                    // If time slot exists, append to it; otherwise create new
                    if (currentSchedule[bakerIdx][time]) {
                        const existing = Array.isArray(currentSchedule[bakerIdx][time]) 
                            ? currentSchedule[bakerIdx][time] 
                            : [currentSchedule[bakerIdx][time]];
                        currentSchedule[bakerIdx][time] = [...existing, ...templateInstances];
                    } else {
                        currentSchedule[bakerIdx][time] = [...templateInstances];
                    }
                } else if (templateInstances) {
                    // Single instance
                    if (currentSchedule[bakerIdx][time]) {
                        const existing = Array.isArray(currentSchedule[bakerIdx][time]) 
                            ? currentSchedule[bakerIdx][time] 
                            : [currentSchedule[bakerIdx][time]];
                        currentSchedule[bakerIdx][time] = [...existing, templateInstances];
                    } else {
                        currentSchedule[bakerIdx][time] = templateInstances;
                    }
                }
            });
        });
        
        // Merge custom task names if they exist
        if (template.customTaskNames) {
            if (!state.customTaskNames[state.currentDate]) {
                state.customTaskNames[state.currentDate] = {};
            }
            Object.keys(template.customTaskNames).forEach(bakerIndex => {
                const bakerIdx = parseInt(bakerIndex);
                if (!state.customTaskNames[state.currentDate][bakerIdx]) {
                    state.customTaskNames[state.currentDate][bakerIdx] = {};
                }
                Object.assign(
                    state.customTaskNames[state.currentDate][bakerIdx],
                    template.customTaskNames[bakerIndex]
                );
            });
        }
        
        // Merge template instances if they exist
        // CRITICAL: Preserve ALL instance properties (duration, color, customName, etc.)
        if (template.scheduledTaskInstances) {
            if (!state.scheduledTaskInstances) {
                state.scheduledTaskInstances = {};
            }
            // Deep merge to preserve all properties
            Object.keys(template.scheduledTaskInstances).forEach(instanceId => {
                if (template.scheduledTaskInstances[instanceId]) {
                    // If instance already exists, merge properties (don't overwrite)
                    if (state.scheduledTaskInstances[instanceId]) {
                        Object.assign(state.scheduledTaskInstances[instanceId], template.scheduledTaskInstances[instanceId]);
                    } else {
                        // New instance, copy all properties
                        state.scheduledTaskInstances[instanceId] = { ...template.scheduledTaskInstances[instanceId] };
                    }
                }
            });
        }
        
        // Add template tasks to library - keep original IDs so schedule references work
        if (template.tasks && template.tasks.length > 0) {
            let addedCount = 0;
            template.tasks.forEach(templateTask => {
                const existsById = state.tasks.some(t => t.id === templateTask.id);
                if (!existsById) {
                    // Keep original task id so the template schedule (which references these ids) still works
                    state.tasks.push(JSON.parse(JSON.stringify(templateTask)));
                    addedCount++;
                }
            });
            
            // Merge categories
            if (template.categories) {
                template.categories.forEach(cat => {
                    if (!state.categories.includes(cat)) {
                        state.categories.push(cat);
                    }
                });
            }
            
            if (addedCount > 0) {
                renderTaskLibrary();
                console.log(`Added ${addedCount} tasks from template (kept original IDs for schedule)`);
            }
        }
        
        saveToStorage();
        renderSchedule();
        closeModal(document.getElementById('template-modal'));
        alert(`Template "${name}" loaded successfully! Tasks have been added to your schedule.`);
    }
}

function deleteTemplate(name) {
    if (confirm(`Delete template "${name}"?`)) {
        delete state.templates[name];
        saveToStorage();
        openTemplateModal('load');
    }
}

// Export a template to a JSON file
function exportTemplate(templateName) {
    const template = state.templates[templateName];
    if (!template) {
        alert(`Template "${templateName}" not found!`);
        return;
    }

    const exportData = {
        name: templateName,
        version: '1.0',
        exportedAt: new Date().toISOString(),
        template: template
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-${templateName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Template "${templateName}" exported successfully!`);
}

// Export a blank template example
function exportBlankTemplate() {
    const blankTemplate = {
        schedule: {
            // Baker index 0 (Baker 1)
            0: {
                // Example: Task at 06:30
                // Format: "06:30": ["taskId|06:30|0|timestamp"]
                // For multiple overlapping tasks: ["taskId1|06:30|0|timestamp1", "taskId2|06:30|0|timestamp2"]
                "06:30": [],
                "06:40": [],
                // Add more time slots as needed (in 10-minute increments from 07:00 to 17:30)
            },
            // Add more bakers as needed (1 for Baker 2, 2 for Baker 3, etc.)
        },
        customTaskNames: {
            // Baker index: { startTime: "Custom Name" }
            // Example: 0: { "06:30": "Morning Mix" }
            0: {}
        },
        bakers: ["Baker 1", "Baker 2", "Baker 3"],
        date: new Date().toISOString()
    };

    const exportData = {
        name: "Blank Template",
        version: '1.0',
        exportedAt: new Date().toISOString(),
        description: "This is a blank template example. Fill in the schedule structure with your task instance IDs.",
        template: blankTemplate,
        instructions: {
            schedule: "Add task instance IDs to time slots. Format: 'taskId|startTime|bakerIndex|timestamp'",
            customTaskNames: "Add custom names for tasks. Format: { bakerIndex: { startTime: 'Custom Name' } }",
            bakers: "List of baker names",
            note: "Time slots should be in 10-minute increments (07:00, 07:10, 07:20, etc. up to 17:30)"
        }
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-blank-example.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Blank template example exported! Use this as a reference for the structure when creating your own templates.');
}

// Import template from a file
function importTemplateFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            console.log('Import data loaded:', importData);
            
            // Validate the import data structure
            if (!importData.template) {
                throw new Error('Invalid template file: missing "template" property. Make sure the file has a "template" object.');
            }

            const template = importData.template;
            
            // Validate required properties
            if (!template.schedule) {
                throw new Error('Invalid template: missing "schedule" property. The template must include a schedule.');
            }

            // Ask for template name
            let templateName = importData.name || file.name.replace('.json', '');
            templateName = prompt('Enter a name for this template:', templateName);
            
            if (!templateName || !templateName.trim()) {
                alert('Template import cancelled.');
                // Reset file input
                event.target.value = '';
                return;
            }

            templateName = templateName.trim();

            // Check if template name already exists
            if (state.templates[templateName]) {
                if (!confirm(`Template "${templateName}" already exists. Overwrite?`)) {
                    // Reset file input
                    event.target.value = '';
                    return;
                }
            }

            // If template doesn't have tasks (old format), try to reconstruct them
            let templateTasks = template.tasks || [];
            let taskIdMapping = {}; // Map old task IDs to new task IDs
            
            if (templateTasks.length === 0 && template.schedule) {
                console.log('Template missing tasks array - attempting to reconstruct from schedule and custom names...');
                
                // Extract all unique task IDs from schedule
                const taskIdsInSchedule = new Set();
                const taskIdToCustomName = {}; // Map taskId -> customName
                const taskIdToStartTime = {}; // Map taskId -> first startTime (for duration estimation)
                
                Object.keys(template.schedule).forEach(bakerIndex => {
                    Object.keys(template.schedule[bakerIndex]).forEach(time => {
                        const instances = template.schedule[bakerIndex][time];
                        const instanceArray = Array.isArray(instances) ? instances : [instances];
                        
                        instanceArray.forEach(instanceStr => {
                            if (typeof instanceStr === 'string') {
                                const parts = instanceStr.split('|');
                                if (parts.length >= 1) {
                                    const taskId = parts[0];
                                    taskIdsInSchedule.add(taskId);
                                    
                                    // Store first start time for this task
                                    if (!taskIdToStartTime[taskId]) {
                                        taskIdToStartTime[taskId] = time;
                                    }
                                    
                                    // Check for custom name
                                    if (template.customTaskNames && template.customTaskNames[bakerIndex] && template.customTaskNames[bakerIndex][time]) {
                                        taskIdToCustomName[taskId] = template.customTaskNames[bakerIndex][time];
                                    }
                                }
                            }
                        });
                    });
                });
                
                // Create tasks for each unique task ID
                taskIdsInSchedule.forEach(oldTaskId => {
                    // Try to find custom name for this task ID - check all occurrences
                    let customName = taskIdToCustomName[oldTaskId];
                    if (!customName) {
                        // Search all custom names for this task ID
                        Object.keys(template.customTaskNames || {}).forEach(bIdx => {
                            Object.keys(template.customTaskNames[bIdx] || {}).forEach(t => {
                                // Check if any instance at this time uses this task ID
                                const instances = template.schedule[bIdx]?.[t];
                                if (instances) {
                                    const instanceArray = Array.isArray(instances) ? instances : [instances];
                                    if (instanceArray.some(inst => typeof inst === 'string' && inst.split('|')[0] === oldTaskId)) {
                                        customName = template.customTaskNames[bIdx][t];
                                    }
                                }
                            });
                        });
                    }
                    
                    let matchingTask = null;
                    
                    if (customName) {
                        // Try to find a task with similar name - be more aggressive in matching
                        matchingTask = state.tasks.find(t => {
                            const taskNameLower = t.name.toLowerCase();
                            const customNameLower = customName.toLowerCase();
                            
                            // Exact match
                            if (taskNameLower === customNameLower) return true;
                            
                            // Check if custom name contains task name or vice versa
                            if (customNameLower.includes(taskNameLower) || taskNameLower.includes(customNameLower.split(' ')[0])) {
                                return true;
                            }
                            
                            // Specific keyword matching
                            const keywords = [
                                ['mix dough', 'mix dough'],
                                ['shape', 'shape'],
                                ['fold', 'fold'],
                                ['unload', 'unload'],
                                ['bake', 'bake'],
                                ['buffer', 'buffer'],
                                ['lunch', 'lunch'],
                                ['coffee', 'coffee break'],
                                ['preshape', 'preshape'],
                                ['baguette', 'baguette'],
                                ['pastry', 'pastry'],
                                ['clean', 'clean'],
                                ['dish', 'dishes'],
                                ['sanitize', 'sanitize'],
                                ['check in', 'check in'],
                                ['check out', 'check out']
                            ];
                            
                            for (const [keyword1, keyword2] of keywords) {
                                if (customNameLower.includes(keyword1) && taskNameLower.includes(keyword2)) {
                                    return true;
                                }
                            }
                            
                            return false;
                        });
                    }
                    
                    // If no custom name and no match, try to infer task from schedule patterns
                    // For tasks without custom names, they might be standard tasks like "Buffer", "Lunch", etc.
                    if (!matchingTask && !customName) {
                        // Check if this task ID appears frequently - might be a common task
                        // Count how many times this task ID appears
                        let appearanceCount = 0;
                        Object.keys(template.schedule).forEach(bIdx => {
                            Object.keys(template.schedule[bIdx] || {}).forEach(t => {
                                const instances = template.schedule[bIdx][t];
                                const instanceArray = Array.isArray(instances) ? instances : [instances];
                                if (instanceArray.some(inst => typeof inst === 'string' && inst.split('|')[0] === oldTaskId)) {
                                    appearanceCount++;
                                }
                            });
                        });
                        
                        // If it appears multiple times with short durations, might be "Buffer"
                        // But we can't reliably match without more context, so we'll create it
                    }
                    
                    if (matchingTask) {
                        // Use existing task, map old ID to new ID
                        taskIdMapping[oldTaskId] = matchingTask.id;
                    } else {
                        // Create new task based on custom name
                        // If no custom name found anywhere, use a descriptive placeholder
                        let taskName = customName;
                        if (!taskName) {
                            // Last resort: create a task with a generic name
                            // The user can rename it later, or it will use custom names when loaded
                            taskName = `Imported Task ${oldTaskId.substring(0, 6)}`;
                        }
                        const newTaskId = generateId();
                        taskIdMapping[oldTaskId] = newTaskId;
                        
                        // Calculate duration based on schedule (count consecutive time slots for this specific instance)
                        let estimatedDuration = 30; // Default
                        if (template.schedule) {
                            const firstStartTime = taskIdToStartTime[oldTaskId];
                            let maxDurationSlots = 1;
                            
                            // Find all instances of this task ID and calculate their durations
                            Object.keys(template.schedule).forEach(bakerIdx => {
                                const bakerSchedule = template.schedule[bakerIdx];
                                const timeSlots = Object.keys(bakerSchedule).sort();
                                
                                // Find all start times for this task ID on this baker
                                const startTimes = [];
                                timeSlots.forEach(time => {
                                    const instances = bakerSchedule[time];
                                    const instanceArray = Array.isArray(instances) ? instances : [instances];
                                    instanceArray.forEach(inst => {
                                        if (typeof inst === 'string') {
                                            const parts = inst.split('|');
                                            if (parts.length >= 4 && parts[0] === oldTaskId && parts[1] === time) {
                                                startTimes.push({ time, instanceId: parts[3] });
                                            }
                                        }
                                    });
                                });
                                
                                // For each start time, calculate duration
                                startTimes.forEach(({ time, instanceId }) => {
                                    const startIndex = timeSlots.indexOf(time);
                                    if (startIndex >= 0) {
                                        let durationSlots = 1;
                                        for (let i = startIndex + 1; i < timeSlots.length; i++) {
                                            const slotInstances = bakerSchedule[timeSlots[i]];
                                            const slotArray = Array.isArray(slotInstances) ? slotInstances : [slotInstances];
                                            // Check if this instance continues in this slot
                                            if (slotArray.some(inst => {
                                                if (typeof inst === 'string') {
                                                    const parts = inst.split('|');
                                                    return parts.length >= 4 && parts[3] === instanceId;
                                                }
                                                return false;
                                            })) {
                                                durationSlots++;
                                            } else {
                                                break;
                                            }
                                        }
                                        maxDurationSlots = Math.max(maxDurationSlots, durationSlots);
                                    }
                                });
                            });
                            estimatedDuration = maxDurationSlots * 10; // 10 minutes per slot
                        }
                        
                        // Determine category from task name
                        let category = 'Other';
                        const nameLower = taskName.toLowerCase();
                        if (nameLower.includes('mix') || nameLower.includes('shape') || nameLower.includes('fold') || nameLower.includes('preshape') || nameLower.includes('dividing')) {
                            category = 'Preparation';
                        } else if (nameLower.includes('bake') || nameLower.includes('unload') || nameLower.includes('cool')) {
                            category = 'Baking';
                        } else if (nameLower.includes('package')) {
                            category = 'Packaging';
                        } else if (nameLower.includes('clean') || nameLower.includes('dish') || nameLower.includes('sanitize')) {
                            category = 'Cleaning';
                        }
                        
                        const newTask = {
                            id: newTaskId,
                            name: taskName,
                            duration: estimatedDuration,
                            productCount: null,
                            category: category
                        };
                        
                        templateTasks.push(newTask);
                        
                        // Add to state tasks if it doesn't exist
                        const exists = state.tasks.some(t => t.name.toLowerCase() === taskName.toLowerCase());
                        if (!exists) {
                            state.tasks.push(newTask);
                        } else {
                            // Use existing task ID
                            const existingTask = state.tasks.find(t => t.name.toLowerCase() === taskName.toLowerCase());
                            taskIdMapping[oldTaskId] = existingTask.id;
                        }
                    }
                });
                
                // Update schedule to use new task IDs and create scheduledTaskInstances with correct durations
                if (Object.keys(taskIdMapping).length > 0) {
                    const newScheduledTaskInstances = {};
                    
                    Object.keys(template.schedule).forEach(bakerIndex => {
                        Object.keys(template.schedule[bakerIndex]).forEach(time => {
                            const instances = template.schedule[bakerIndex][time];
                            const instanceArray = Array.isArray(instances) ? instances : [instances];
                            const updatedInstances = instanceArray.map(instanceStr => {
                                if (typeof instanceStr === 'string') {
                                    const parts = instanceStr.split('|');
                                    if (parts.length >= 4 && taskIdMapping[parts[0]]) {
                                        const oldTaskId = parts[0];
                                        const newTaskId = taskIdMapping[oldTaskId];
                                        const instanceId = parts[3];
                                        
                                        // Calculate duration for this instance
                                        let instanceDuration = 30; // Default
                                        const timeSlots = Object.keys(template.schedule[bakerIndex]).sort();
                                        const startIndex = timeSlots.indexOf(time);
                                        if (startIndex >= 0) {
                                            let durationSlots = 1;
                                            for (let i = startIndex + 1; i < timeSlots.length; i++) {
                                                const slotInstances = template.schedule[bakerIndex][timeSlots[i]];
                                                const slotArray = Array.isArray(slotInstances) ? slotInstances : [slotInstances];
                                                if (slotArray.some(inst => typeof inst === 'string' && inst.split('|')[3] === instanceId)) {
                                                    durationSlots++;
                                                } else {
                                                    break;
                                                }
                                            }
                                            instanceDuration = durationSlots * 10;
                                        }
                                        
                                        // Find the task to get its default duration
                                        const task = templateTasks.find(t => t.id === newTaskId) || state.tasks.find(t => t.id === newTaskId);
                                        if (task && instanceDuration !== task.duration) {
                                            // Store instance with custom duration
                                            newScheduledTaskInstances[instanceId] = {
                                                duration: instanceDuration
                                            };
                                        }
                                        
                                        // Replace old task ID with new one, keep rest of instance ID
                                        return `${newTaskId}|${parts[1]}|${parts[2]}|${instanceId}`;
                                    }
                                }
                                return instanceStr;
                            });
                            template.schedule[bakerIndex][time] = updatedInstances.length === 1 ? updatedInstances[0] : updatedInstances;
                        });
                    });
                    
                    // Merge instance properties into template
                    if (Object.keys(newScheduledTaskInstances).length > 0) {
                        template.scheduledTaskInstances = { ...template.scheduledTaskInstances, ...newScheduledTaskInstances };
                    }
                }
                
                console.log(`Reconstructed ${templateTasks.length} tasks from template schedule`);
            }

            // Import the template
            state.templates[templateName] = {
                schedule: template.schedule || {},
                customTaskNames: template.customTaskNames || {},
                scheduledTaskInstances: template.scheduledTaskInstances || {},
                bakers: template.bakers || [...getBakersForDate(state.currentDate)],
                tasks: templateTasks, // Use reconstructed tasks
                categories: template.categories || [...state.categories], // Import categories if available
                date: template.date || new Date().toISOString()
            };

            // Merge tasks from template (don't replace, add missing ones)
            if (templateTasks.length > 0) {
                let addedCount = 0;
                templateTasks.forEach(templateTask => {
                    // Check if task with same name exists
                    const exists = state.tasks.some(t => t.name.toLowerCase() === templateTask.name.toLowerCase());
                    if (!exists) {
                        // Generate new ID for imported task
                        const newTask = {
                            ...templateTask,
                            id: generateId()
                        };
                        state.tasks.push(newTask);
                        addedCount++;
                    }
                });
                
                // Merge categories
                if (template.categories) {
                    template.categories.forEach(cat => {
                        if (!state.categories.includes(cat)) {
                            state.categories.push(cat);
                        }
                    });
                }
                
                if (addedCount > 0) {
                    renderTaskLibrary();
                    console.log(`Added ${addedCount} tasks from template`);
                }
            }

            saveToStorage();
            
            // Ask if user wants to load the template immediately
            if (confirm(`Template "${templateName}" imported successfully! Would you like to load it now?`)) {
                loadTemplate(templateName);
            } else {
                alert(`Template "${templateName}" imported! You can load it from the "Load Template" button.`);
            }
            
            // Refresh template modal if it's open
            const modal = document.getElementById('template-modal');
            if (modal.classList.contains('active')) {
                openTemplateModal('load');
            }
        } catch (error) {
            console.error('Import error:', error);
            console.error('Error stack:', error.stack);
            alert(`Error importing template: ${error.message}\n\nPlease make sure the file is a valid template JSON file.\n\nCheck the browser console for more details.`);
        }
    };

    reader.onerror = function(error) {
        console.error('File read error:', error);
        alert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
    
    // Reset file input so the same file can be imported again
    event.target.value = '';
}

// Export all application data (tasks, templates, schedules, etc.)
function exportAllData() {
    const exportData = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        description: 'Complete export of all Atome Bakery Schedule data including tasks, templates, schedules, and settings',
        data: {
            tasks: state.tasks,
            categories: state.categories,
            bakers: state.bakers,
            schedule: state.schedule,
            customTaskNames: state.customTaskNames,
            scheduledTaskInstances: state.scheduledTaskInstances,
            templates: state.templates,
            openDates: state.openDates
        }
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `bakery-schedule-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('All data exported successfully! This file contains:\n- All tasks\n- All templates\n- All schedules\n- All settings\n\nShare this file with your team to sync everything.');
}

// Import all application data from a file
function importAllDataFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            console.log('Import data loaded:', importData);
            
            // Support both old format (direct data) and new format (wrapped in 'data')
            const data = importData.data || importData;
            
            if (!confirm('Import all data? This will REPLACE your current data with the backup.\n\n- All tasks\n- All templates\n- All schedules\n- Categories and bakers\n\nYour current data will be overwritten.')) {
                event.target.value = '';
                return;
            }
            
            // Replace tasks
            state.tasks = Array.isArray(data.tasks) ? JSON.parse(JSON.stringify(data.tasks)) : [];
            
            // Replace categories
            state.categories = Array.isArray(data.categories) ? [...data.categories] : ['Preparation', 'Baking', 'Packaging', 'Cleaning', 'Other'];
            
            // Replace bakers
            if (data.bakers) {
                if (Array.isArray(data.bakers)) {
                    state.bakers = {};
                    (data.openDates || [state.currentDate]).forEach(date => {
                        state.bakers[date] = [...data.bakers];
                    });
                } else if (typeof data.bakers === 'object') {
                    state.bakers = JSON.parse(JSON.stringify(data.bakers));
                }
            } else {
                state.bakers = {};
            }
            
            // Replace schedule
            state.schedule = (data.schedule && typeof data.schedule === 'object') ? JSON.parse(JSON.stringify(data.schedule)) : {};
            
            // Replace customTaskNames
            state.customTaskNames = (data.customTaskNames && typeof data.customTaskNames === 'object') ? JSON.parse(JSON.stringify(data.customTaskNames)) : {};
            
            // Replace scheduledTaskInstances
            state.scheduledTaskInstances = (data.scheduledTaskInstances && typeof data.scheduledTaskInstances === 'object') ? JSON.parse(JSON.stringify(data.scheduledTaskInstances)) : {};
            
            // Replace templates
            state.templates = (data.templates && typeof data.templates === 'object') ? JSON.parse(JSON.stringify(data.templates)) : {};
            
            // Replace openDates and ensure current date is included
            state.openDates = Array.isArray(data.openDates) ? [...data.openDates] : [state.currentDate];
            if (!state.openDates.includes(state.currentDate)) {
                state.openDates.unshift(state.currentDate);
            }
            
            // Ensure current date has bakers
            if (!state.bakers[state.currentDate] || state.bakers[state.currentDate].length === 0) {
                state.bakers[state.currentDate] = ['Baker 1', 'Baker 2'];
            }
            
            saveToStorage();
            renderTaskLibrary();
            renderScheduleTabs();
            renderSchedule();
            updateDateInput();
            if (typeof syncHeaderScroll === 'function') syncHeaderScroll();
            
            alert(`Data imported successfully!\n- Tasks: ${state.tasks.length}\n- Templates: ${Object.keys(state.templates).length}\n- Your previous data has been replaced.`);
            console.log('Import complete. Summary:', {
                tasks: state.tasks.length,
                templates: Object.keys(state.templates).length,
                categories: state.categories.length,
                bakers: getBakersForDate(state.currentDate).length
            });
        } catch (error) {
            console.error('Import error:', error);
            console.error('Error stack:', error.stack);
            alert(`Error importing data: ${error.message}\n\nPlease make sure the file is a valid export file.\n\nCheck the browser console for more details.`);
        }
    };

    reader.onerror = function(error) {
        console.error('File read error:', error);
        alert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
}

// Export tasks only (for sharing task library)
function exportTasks() {
    const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        description: 'Tasks and categories export - Share this file to add these tasks to another app',
        type: 'tasks-only',
        data: {
            tasks: state.tasks,
            categories: state.categories
        }
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `bakery-tasks-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Tasks exported successfully!\n\nFile: bakery-tasks-${dateStr}.json\n\nThis file contains:\n- ${state.tasks.length} tasks\n- ${state.categories.length} categories\n\nShare this file with your team to add these tasks to their app.`);
}

// Import tasks from file (merges, doesn't replace)
function importTasksFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            console.log('Import tasks data loaded:', importData);
            
            // Support both tasks-only format and full data format
            const data = importData.data || importData;
            
            if (!data.tasks || !Array.isArray(data.tasks)) {
                alert('Invalid file format. The file must contain a "tasks" array.\n\nExpected format: { "tasks": [...], "categories": [...] }');
                event.target.value = '';
                return;
            }
            
            let addedTasks = 0;
            let skippedTasks = 0;
            
            // Merge tasks (don't replace, add missing ones by name)
            data.tasks.forEach(importedTask => {
                const exists = state.tasks.some(t => t.name.toLowerCase() === importedTask.name.toLowerCase());
                if (!exists) {
                    // Generate new ID to avoid conflicts
                    const newTask = {
                        ...importedTask,
                        id: generateId()
                    };
                    state.tasks.push(newTask);
                    addedTasks++;
                } else {
                    skippedTasks++;
                }
            });
            
            // Merge categories
            if (data.categories && Array.isArray(data.categories)) {
                let addedCategories = 0;
                data.categories.forEach(cat => {
                    if (!state.categories.includes(cat)) {
                        state.categories.push(cat);
                        addedCategories++;
                    }
                });
                if (addedCategories > 0) {
                    console.log(`Added ${addedCategories} new categories`);
                }
            }
            
            saveToStorage();
            renderTaskLibrary();
            
            const message = `Tasks imported successfully!\n\n` +
                          `✅ Added: ${addedTasks} new tasks\n` +
                          (skippedTasks > 0 ? `⏭️  Skipped: ${skippedTasks} tasks (already exist)\n` : '') +
                          `\nTotal tasks now: ${state.tasks.length}\n\n` +
                          `Your existing tasks were preserved. New tasks were added.`;
            
            alert(message);
            console.log('Tasks import complete. Summary:', {
                added: addedTasks,
                skipped: skippedTasks,
                total: state.tasks.length
            });
        } catch (error) {
            console.error('Import tasks error:', error);
            alert(`Error importing tasks: ${error.message}\n\nPlease make sure the file is a valid tasks export file.`);
        }
    };

    reader.onerror = function(error) {
        console.error('File read error:', error);
        alert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
}

// Make functions available globally
window.exportTemplate = exportTemplate;
window.exportBlankTemplate = exportBlankTemplate;
window.importTemplateFromFile = importTemplateFromFile;
window.exportAllData = exportAllData;
window.exportTasks = exportTasks;

// View Management
function showPrintView() {
    document.getElementById('admin-view').classList.remove('active');
    document.getElementById('print-view').classList.add('active');
    renderPrintView();
}

function showAdminView() {
    document.getElementById('print-view').classList.remove('active');
    document.getElementById('admin-view').classList.add('active');
}

function renderPrintView() {
    const printSchedule = document.getElementById('print-schedule');
    const timeSlots = generateTimeSlots();
    const schedule = getScheduleForDate(state.currentDate);
    const date = state.currentDate;
    const bakers = getBakersForDate(state.currentDate);
    const numBakers = bakers.length;

    // Date display
    const dateParts = state.currentDate.split('-');
    const localDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dateDisplay = localDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Collect tasks per baker: {startIndex, durationSlots, taskColor, displayName, startTime, actualDuration}
    const bakerTasks = bakers.map((baker, bakerIndex) => {
        const bakerSchedule = schedule[bakerIndex] || {};
        const rendered = new Set();
        const tasks = [];

        timeSlots.forEach((time, timeIndex) => {
            const raw = bakerSchedule[time];
            if (!raw) return;
            const instanceIds = Array.isArray(raw) ? raw : [raw];

            instanceIds.forEach(instanceId => {
                if (rendered.has(instanceId)) return;
                let parts = String(instanceId).split('|');
                let taskId, instanceStartTime, instanceBakerIndex;
                if (parts.length >= 4) {
                    [taskId, instanceStartTime, instanceBakerIndex] = [parts[0], parts[1], parseInt(parts[2])];
                } else {
                    parts = String(instanceId).split('_');
                    if (parts.length < 3) return;
                    [taskId, instanceStartTime, instanceBakerIndex] = [parts[0], parts[1], parseInt(parts[2])];
                }
                if (instanceStartTime !== time || instanceBakerIndex !== bakerIndex) return;

                const task = state.tasks.find(t => t.id === taskId);
                if (!task) { console.warn(`Print: task not found: ${taskId}`); return; }

                let actualDuration = task.duration;
                if (state.scheduledTaskInstances && state.scheduledTaskInstances[instanceId]) {
                    const p = state.scheduledTaskInstances[instanceId];
                    if (p.duration !== undefined) actualDuration = p.duration;
                }
                const taskIndex = state.tasks.findIndex(t => t.id === task.id);
                const taskColor = task.color || state.taskColors[taskIndex % state.taskColors.length];
                const customName = getCustomTaskName(instanceId) || getCustomTaskNameLegacy(date, bakerIndex, time);
                const displayName = customName || task.name;

                tasks.push({ startIndex: timeIndex, durationSlots: Math.ceil(actualDuration / 10),
                    taskColor, displayName, startTime: time, actualDuration, task });
                rendered.add(instanceId);
            });
        });
        return tasks;
    });

    // Build CSS grid cells — one row per time slot, columns: time + bakers
    // Track which rows are already "consumed" by a spanning task
    const occupied = bakers.map(() => new Set());
    let gridHTML = '';

    // Header row
    gridHTML += `<div class="pg-time-header">Time</div>`;
    bakers.forEach(baker => { gridHTML += `<div class="pg-baker-header">${baker}</div>`; });

    // Time rows
    timeSlots.forEach((time, timeIndex) => {
        const isMajor = time.endsWith(':00') || time.endsWith(':30');
        gridHTML += `<div class="pg-time-slot${isMajor ? ' pg-time-major' : ''}">${isMajor ? time : ''}</div>`;

        bakers.forEach((baker, bakerIndex) => {
            if (occupied[bakerIndex].has(timeIndex)) return; // spanned — CSS grid handles space

            const taskInfo = bakerTasks[bakerIndex].find(t => t.startIndex === timeIndex);
            if (taskInfo) {
                const { durationSlots, taskColor, displayName, startTime, actualDuration } = taskInfo;
                const endTime = calculateEndTime(startTime, actualDuration);
                for (let i = 1; i < durationSlots; i++) occupied[bakerIndex].add(timeIndex + i);

                const spanStyle = durationSlots > 1
                    ? `grid-row: span ${durationSlots}; background-color: ${taskColor};`
                    : `background-color: ${taskColor};`;
                gridHTML += `<div class="pg-task" style="${spanStyle}">
                    <div class="pg-task-name">${displayName}</div>
                    <div class="pg-task-time">${startTime} – ${endTime}</div>
                </div>`;
            } else {
                gridHTML += `<div class="pg-empty-slot"></div>`;
            }
        });
    });

    printSchedule.innerHTML = `
        <div class="print-schedule-header">
            <h1>Atome Bakery — Production Schedule</h1>
            <div class="date">${dateDisplay}</div>
        </div>
        <div class="pg-grid" style="grid-template-columns: 52px repeat(${numBakers}, 1fr);">
            ${gridHTML}
        </div>
    `;
}

// ============================================================================
// 9. UTILITY FUNCTIONS
// ============================================================================

// Utility Functions
function formatTime(time) {
    return time;
}

function calculateEndTime(startTime, duration) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function updateDateInput() {
    document.getElementById('schedule-date').value = state.currentDate;
}

// Get today's date as YYYY-MM-DD string (local timezone, no timezone shift)
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function closeModal(modal) {
    modal.classList.remove('active');
}

// ============================================================================
// 8. STORAGE MANAGEMENT
// ============================================================================

// Storage Management
function saveToStorage() {
    try {
        localStorage.setItem('bakerySchedule', JSON.stringify({
            tasks: state.tasks,
            categories: state.categories,
            bakers: state.bakers,
            schedule: state.schedule,
            customTaskNames: state.customTaskNames,
            scheduledTaskInstances: state.scheduledTaskInstances || {},
            templates: state.templates,
            openDates: state.openDates,
            collapsedCategories: Array.from(state.collapsedCategories) // Convert Set to Array for JSON
        }));
    } catch (error) {
        console.error('Error saving to storage:', error);
        alert('Error saving data. Your browser may be out of storage space.');
    }
}

function loadFromStorage() {
    const saved = localStorage.getItem('bakerySchedule');
    if (saved) {
        const data = JSON.parse(saved);
        state.tasks = data.tasks || [];
        state.categories = data.categories || ['Preparation', 'Baking', 'Packaging', 'Cleaning'];
        
        // Handle bakers migration: old format (array) -> new format (date-specific object)
        if (Array.isArray(data.bakers)) {
            // Old format: migrate to date-specific
            const defaultBakers = data.bakers;
            state.bakers = {};
            // Initialize current date with old bakers
            state.bakers[state.currentDate] = [...defaultBakers];
            // Initialize all open dates with defaults
            const allDates = data.openDates || [getTodayDateString()];
            allDates.forEach(date => {
                if (!state.bakers[date]) {
                    state.bakers[date] = [...defaultBakers];
                }
            });
        } else if (data.bakers && typeof data.bakers === 'object') {
            // New format: already date-specific
            state.bakers = data.bakers;
        } else {
            // No bakers data: use defaults
            state.bakers = {};
        }
        
        state.schedule = data.schedule || {};
        state.customTaskNames = data.customTaskNames || {}; // Keep for backward compatibility
        state.scheduledTaskInstances = data.scheduledTaskInstances || {};
        state.templates = data.templates || {};
        state.openDates = data.openDates || [getTodayDateString()];
        // Ensure currentDate is in openDates
        if (!state.openDates.includes(state.currentDate)) {
            state.openDates.push(state.currentDate);
        }
        
        // Load collapsed categories, default to all collapsed if not found
        if (data.collapsedCategories && Array.isArray(data.collapsedCategories)) {
            state.collapsedCategories = new Set(data.collapsedCategories);
        } else {
            // Default: all categories collapsed on first load
            state.collapsedCategories = new Set([...state.categories, '']); // Include empty string for uncategorized
        }
        
        // Ensure current date has bakers initialized
        if (!state.bakers[state.currentDate]) {
            state.bakers[state.currentDate] = ['Baker 1', 'Baker 2', 'Baker 3'];
        }
        
        // Migrate old customTaskNames (by date/bakerIndex/startTime) to new format (by instanceId)
        // This ensures backward compatibility
        if (state.customTaskNames && Object.keys(state.customTaskNames).length > 0) {
            Object.keys(state.customTaskNames).forEach(date => {
                const dateCustomNames = state.customTaskNames[date];
                if (dateCustomNames && typeof dateCustomNames === 'object') {
                    Object.keys(dateCustomNames).forEach(bakerIndexStr => {
                        const bakerIndex = parseInt(bakerIndexStr);
                        const bakerCustomNames = dateCustomNames[bakerIndex];
                        if (bakerCustomNames && typeof bakerCustomNames === 'object') {
                            Object.keys(bakerCustomNames).forEach(startTime => {
                                const customName = bakerCustomNames[startTime];
                                if (customName) {
                                    // Find the instanceId for this date/bakerIndex/startTime
                                    const schedule = state.schedule[date];
                                    if (schedule && schedule[bakerIndex] && schedule[bakerIndex][startTime]) {
                                        const instanceIdOrArray = schedule[bakerIndex][startTime];
                                        const instanceIds = Array.isArray(instanceIdOrArray) ? instanceIdOrArray : [instanceIdOrArray];
                                        // Find matching instance
                                        const matchingInstance = instanceIds.find(instId => {
                                            const parts = String(instId).split('|');
                                            if (parts.length >= 3) {
                                                return parts[1] === startTime && parseInt(parts[2]) === bakerIndex;
                                            }
                                            const oldParts = String(instId).split('_');
                                            return oldParts.length >= 3 && oldParts[1] === startTime && parseInt(oldParts[2]) === bakerIndex;
                                        });
                                        
                                        if (matchingInstance) {
                                            // Migrate to new format
                                            if (!state.scheduledTaskInstances[matchingInstance]) {
                                                state.scheduledTaskInstances[matchingInstance] = {};
                                            }
                                            state.scheduledTaskInstances[matchingInstance].customName = customName;
                                        }
                                    }
                                }
                            });
                        }
                    });
                }
            });
            // Clear old customTaskNames after migration (optional - we keep it for now in case of issues)
            // state.customTaskNames = {};
        }
    }
}

// Excel Import (simplified - user can paste CSV data)
function importTasksFromExcel() {
    const csv = prompt('Paste CSV data from Excel (format: Task Name, Duration (min), Product Count (optional)):\n\nExample:\nMix Dough,60,100\nBake Bread,30,50');
    if (!csv) return;

    const lines = csv.split('\n').filter(line => line.trim());
    let imported = 0;

    lines.forEach(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
            const name = parts[0];
            const duration = parseInt(parts[1]) || 30;
            const productCount = parts[2] ? parseInt(parts[2]) : null;

            // Check if task already exists
            if (!state.tasks.find(t => t.name.toLowerCase() === name.toLowerCase())) {
                state.tasks.push({
                    id: generateId(),
                    name: name,
                    duration: duration,
                    productCount: productCount
                });
                imported++;
            }
        }
    });

    if (imported > 0) {
        saveToStorage();
        renderTaskLibrary();
        alert(`Imported ${imported} new task(s)!`);
    } else {
        alert('No new tasks imported. Tasks may already exist.');
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);