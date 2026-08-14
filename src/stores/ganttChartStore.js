import { create } from 'zustand';
import dayjs from 'dayjs';
import config from '../Config/config';
import { api } from '../api/client.js';

const useGanttStore = create((set, get) => ({
  dateRange: [dayjs().startOf('day'), dayjs().endOf('day')],
  selectedMachine: 'all',
  ganttData: [], // This will be the data displayed in the chart
  allGanttData: [], // This will store all data for the date range
  machines: [], // This will store the list of unique, valid machines
  isLoading: false,
  error: null,
  lastRefresh: null,

  fetchGanttData: async (forceRefresh = false, customDateRange = null) => {
    const { dateRange } = get();
    const rangeToUse = customDateRange || dateRange;
    
    set({ isLoading: true, error: null });

    try {
      const queryParams = new URLSearchParams();

      // Use provided date range or current store date range
      // For refresh button (forceRefresh=true), use today's date
      if (forceRefresh) {
        const todayStart = dayjs().startOf('day');
        const todayEnd = dayjs().endOf('day');
        queryParams.append('start_date', todayStart.format('YYYY-MM-DD HH:mm:ss'));
        queryParams.append('end_date', todayEnd.format('YYYY-MM-DD HH:mm:ss'));
      } else if (rangeToUse?.[0] && rangeToUse?.[1]) {
        const startDate = dayjs(rangeToUse[0]);
        const endDate = dayjs(rangeToUse[1]);

        if (!startDate.isValid() || !endDate.isValid()) {
          throw new Error('Invalid date range');
        }

        queryParams.append('start_date', startDate.format('YYYY-MM-DD HH:mm:ss'));
        queryParams.append('end_date', endDate.format('YYYY-MM-DD HH:mm:ss'));
      }

      const url = `/production-analytics/combined-schedule-production${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await api.get(url);

      // Ensure we have arrays even if the API returns null/undefined
      const { planned_operations = [], actual_production_logs = [], all_machines = [], live_status_segments = [], operator_issue_segments = [] } = response.data || {};

      // Transform planned operations
      const plannedItems = (planned_operations || [])
        .filter(op => {
          const hasRequiredFields = op.planned_start_time && op.planned_end_time && op.machine_name;
          const isValidDates = dayjs(op.planned_start_time).isValid() && dayjs(op.planned_end_time).isValid();
          return hasRequiredFields && isValidDates;
        })
        .map(op => ({
          id: `planned-${op.id}`,
          machine: op.machine_name,
          type: 'scheduled',
          start_time: op.planned_start_time,
          end_time: op.planned_end_time,
          component: op.part_number,
          description: `Operation ${op.operation_id}`,
          quantity: op.total_quantity,
          po: op.sale_order_number,
          status: op.status,
          operation_name: op.operation_name,
          operation_number: op.operation_number
        }));

      // Transform actual production logs
      const productionItems = (actual_production_logs || [])
        .filter(log => {
          const hasRequiredFields = log.from_date && log.from_time && log.machine_name;
          const isValidDates = dayjs(`${log.from_date} ${log.from_time}`).isValid();
          return hasRequiredFields && isValidDates;
        })
        .map(log => {
          const startDateTime = dayjs(`${log.from_date} ${log.from_time}`);
          let endDateTime = dayjs(`${log.from_date} ${log.from_time}`);
          
          if (log.to_date && log.to_time) {
            endDateTime = dayjs(`${log.to_date} ${log.to_time}`);
          }
          
          return {
            id: `prod-${log.id}`,
            machine: log.machine_name,
            type: 'production',
            start_time: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
            end_time: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
            component: log.part_number,
            description: `Operation ${log.operation_id}`,
            quantity: log.produced_quantity,
            po: log.sale_order_number || 'N/A',
            operator: log.operator_name,
            status: log.status,
            is_completed: log.is_completed,
            operation_name: log.operation_name,
            operation_number: log.operation_number,
            produced_quantity: log.produced_quantity,
            approved_quantity: log.approved_quantity
          };
        });

      // Transform live machine status segments from machine_live_history
      const liveItems = (live_status_segments || [])
        .filter((seg) => {
          const hasRequired = seg.start_time && seg.end_time && seg.machine_name && seg.status;
          return hasRequired && dayjs(seg.start_time).isValid() && dayjs(seg.end_time).isValid();
        })
        .map((seg) => ({
          id: seg.id || `live-${seg.machine_id}-${seg.start_time}`,
          machine: seg.machine_name,
          type: 'live',
          start_time: seg.start_time,
          end_time: seg.end_time,
          component: seg.status,
          description: `Live ${seg.status}`,
          quantity: null,
          po: null,
          status: seg.status,
          live_status: seg.status,
        }));

      // Transform operator issues from maintenance.oee_issues
      const issueItems = (operator_issue_segments || [])
        .filter((seg) => {
          const hasRequired = seg.start_time && seg.end_time && seg.machine_name;
          return hasRequired && dayjs(seg.start_time).isValid() && dayjs(seg.end_time).isValid();
        })
        .map((seg) => ({
          id: seg.id || `issue-${seg.machine_id}-${seg.start_time}`,
          machine: seg.machine_name,
          type: 'issues',
          start_time: seg.start_time,
          end_time: seg.end_time,
          component: seg.issue_category || 'Issue',
          description: seg.issue_reason || 'Operator issue',
          quantity: null,
          po: null,
          status: seg.issue_category,
          issue_category: seg.issue_category,
          issue_reason: seg.issue_reason,
        }));
      
      const combinedData = [...plannedItems, ...productionItems, ...liveItems, ...issueItems];

      // Filter out "Default" machines from the entire dataset, checking if the name includes "default"
      const allDataFiltered = combinedData.filter(item => 
        item.machine && !item.machine.toLowerCase().includes('default')
      );

      // Get unique machine names from the filtered data (like BEL)
      const uniqueMachines = [...new Set(allDataFiltered.map(item => item.machine))].sort();

      set({
        allGanttData: allDataFiltered, // Store all valid data
        ganttData: allDataFiltered, // Default: show all machines
        machines: uniqueMachines,
        selectedMachine: 'all',
        isLoading: false,
        lastRefresh: dayjs(),
        error: null
      });

    } catch (error) {
      console.error('Error fetching gantt data:', error);
      set({ 
        error: error.message || 'Failed to fetch data. Please try again.',
        isLoading: false,
        ganttData: [],
        allGanttData: [],
        machines: []
      });
    }
  },

  setDateRange: (range) => {
    if (!range || !Array.isArray(range) || range.length !== 2) {
      return;
    }

    const [start, end] = range;

    set({ dateRange: [start, end] });
  },

  setSelectedMachine: (machine) => {
    const { allGanttData } = get();
    let newGanttData = allGanttData;
    if (machine === 'scheduled') {
      const scheduledMachines = new Set(
        allGanttData.filter((item) => item.type === 'scheduled').map((item) => item.machine)
      );
      newGanttData = allGanttData.filter((item) => scheduledMachines.has(item.machine));
    } else if (machine !== 'all') {
      newGanttData = allGanttData.filter((item) => item.machine === machine);
    }

    set({
      selectedMachine: machine,
      ganttData: newGanttData
    });
  },

  fetchAllData: async () => {
    set({ isLoading: true, error: null });

    try {
      const queryParams = new URLSearchParams();
      const qs = queryParams.toString();
      const url = `/production-analytics/combined-schedule-production/${qs ? `?${qs}` : ''}`;

      const response = await api.get(url);

      // Ensure we have arrays even if the API returns null/undefined
      const { planned_operations = [], actual_production_logs = [], all_machines = [], live_status_segments = [], operator_issue_segments = [] } = response.data || {};

      // Transform planned operations
      const plannedItems = (planned_operations || [])
        .filter(op => {
          const hasRequiredFields = op.planned_start_time && op.planned_end_time && op.machine_name;
          const isValidDates = dayjs(op.planned_start_time).isValid() && dayjs(op.planned_end_time).isValid();
          return hasRequiredFields && isValidDates;
        })
        .map(op => ({
          id: `planned-${op.id}`,
          machine: op.machine_name,
          type: 'scheduled',
          start_time: op.planned_start_time,
          end_time: op.planned_end_time,
          component: op.part_number,
          description: `Operation ${op.operation_id}`,
          quantity: op.total_quantity,
          po: op.sale_order_number,
          status: op.status,
          operation_name: op.operation_name,
          operation_number: op.operation_number
        }));

      // Transform actual production logs
      const productionItems = (actual_production_logs || [])
        .filter(log => {
          const hasRequiredFields = log.from_date && log.from_time && log.machine_name;
          const isValidDates = dayjs(`${log.from_date} ${log.from_time}`).isValid();
          return hasRequiredFields && isValidDates;
        })
        .map(log => {
          const startDateTime = dayjs(`${log.from_date} ${log.from_time}`);
          let endDateTime = dayjs(`${log.from_date} ${log.from_time}`);
          
          if (log.to_date && log.to_time) {
            endDateTime = dayjs(`${log.to_date} ${log.to_time}`);
          }
          
          return {
            id: `prod-${log.id}`,
            machine: log.machine_name,
            type: 'production',
            start_time: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
            end_time: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
            component: log.part_number,
            description: `Operation ${log.operation_id}`,
            quantity: log.produced_quantity,
            po: log.sale_order_number || 'N/A',
            operator: log.operator_name,
            status: log.status,
            is_completed: log.is_completed,
            operation_name: log.operation_name,
            operation_number: log.operation_number,
            produced_quantity: log.produced_quantity,
            approved_quantity: log.approved_quantity
          };
        });

      // Transform live machine status segments from machine_live_history
      const liveItems = (live_status_segments || [])
        .filter((seg) => {
          const hasRequired = seg.start_time && seg.end_time && seg.machine_name && seg.status;
          return hasRequired && dayjs(seg.start_time).isValid() && dayjs(seg.end_time).isValid();
        })
        .map((seg) => ({
          id: seg.id || `live-${seg.machine_id}-${seg.start_time}`,
          machine: seg.machine_name,
          type: 'live',
          start_time: seg.start_time,
          end_time: seg.end_time,
          component: seg.status,
          description: `Live ${seg.status}`,
          quantity: null,
          po: null,
          status: seg.status,
          live_status: seg.status,
        }));

      // Transform operator issues from maintenance.oee_issues
      const issueItems = (operator_issue_segments || [])
        .filter((seg) => {
          const hasRequired = seg.start_time && seg.end_time && seg.machine_name;
          return hasRequired && dayjs(seg.start_time).isValid() && dayjs(seg.end_time).isValid();
        })
        .map((seg) => ({
          id: seg.id || `issue-${seg.machine_id}-${seg.start_time}`,
          machine: seg.machine_name,
          type: 'issues',
          start_time: seg.start_time,
          end_time: seg.end_time,
          component: seg.issue_category || 'Issue',
          description: seg.issue_reason || 'Operator issue',
          quantity: null,
          po: null,
          status: seg.issue_category,
          issue_category: seg.issue_category,
          issue_reason: seg.issue_reason,
        }));
      
      const combinedData = [...plannedItems, ...productionItems, ...liveItems, ...issueItems];

      // Filter out "Default" machines from the entire dataset, checking if the name includes "default"
      const allDataFiltered = combinedData.filter(item => 
        item.machine && !item.machine.toLowerCase().includes('default')
      );

      // Get unique machine names from the filtered data (like BEL)
      const uniqueMachines = [...new Set(allDataFiltered.map(item => item.machine))].sort();

      set({
        allGanttData: allDataFiltered, // Store all valid data
        ganttData: allDataFiltered, // Default: show all machines
        machines: uniqueMachines,
        selectedMachine: 'all',
        isLoading: false,
        lastRefresh: dayjs(),
        error: null
      });

    } catch (error) {
      console.error('Error fetching all gantt data:', error);
      set({ 
        error: error.message || 'Failed to fetch data. Please try again.',
        isLoading: false,
        ganttData: [],
        allGanttData: [],
        machines: []
      });
    }
  },

  resetData: () => {
    const defaultRange = [dayjs().startOf('day'), dayjs().endOf('day')];
    set({
      dateRange: defaultRange,
      selectedMachine: 'all',
      error: null,
      lastRefresh: null,
      ganttData: [],
      allGanttData: [],
      machines: []
    });
    // Refetch all data for the default range
    get().fetchGanttData();
  }
}));

export default useGanttStore;
