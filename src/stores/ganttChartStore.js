import { create } from 'zustand';
import dayjs from 'dayjs';
import axios from 'axios';
import config from '../Config/config';

// Helper function to find min/max dates
const findDateRange = (items) => {
  if (!items.length) return null;
  
  let earliest = dayjs(items[0].start_time);
  let latest = dayjs(items[0].end_time);
  
  items.forEach(item => {
    const start = dayjs(item.start_time);
    const end = dayjs(item.end_time);
    
    if (start.isBefore(earliest)) earliest = start;
    if (end.isAfter(latest)) latest = end;
  });
  
  return {
    earliest: earliest.format('YYYY-MM-DD HH:mm:ss'),
    latest: latest.format('YYYY-MM-DD HH:mm:ss')
  };
};

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

      const url = `${config.API_BASE_URL}/production-analytics/combined-schedule-production/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      console.log('Fetching from URL:', url);

      const response = await axios.get(url);
      console.log('Raw API response:', response.data);

      // Ensure we have arrays even if the API returns null/undefined
      const { planned_operations = [], actual_production_logs = [], all_machines = [] } = response.data || {};

      // Log raw data
      console.log('Raw data counts:', {
        planned_operations: planned_operations?.length || 0,
        actual_production_logs: actual_production_logs?.length || 0
      });

      // Transform planned operations
      const plannedItems = (planned_operations || [])
        .filter(op => {
          const hasRequiredFields = op.planned_start_time && op.planned_end_time && op.machine_name;
          const isValidDates = dayjs(op.planned_start_time).isValid() && dayjs(op.planned_end_time).isValid();
          if (!hasRequiredFields || !isValidDates) {
            console.log('Filtered out planned operation:', op);
          }
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
          if (!hasRequiredFields || !isValidDates) {
            console.log('Filtered out production log:', log);
          }
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
      
      const combinedData = [...plannedItems, ...productionItems];

      // Filter out "Default" machines from the entire dataset, checking if the name includes "default"
      const allDataFiltered = combinedData.filter(item => 
        item.machine && !item.machine.toLowerCase().includes('default')
      );

      // Get unique machine names from the filtered data (like BEL)
      const uniqueMachines = [...new Set(allDataFiltered.map(item => item.machine))].sort();
      
      console.log('Final data analysis:', {
        totalItems: allDataFiltered.length,
        uniqueMachines: uniqueMachines,
        dateRange: findDateRange(allDataFiltered)
      });

      set({ 
        allGanttData: allDataFiltered, // Store all valid data
        ganttData: allDataFiltered, // Initially display all valid data
        machines: uniqueMachines, // Set the dynamic machine list (only machines with data)
        selectedMachine: 'all', // Reset selection to 'all'
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
      console.log('Invalid range provided to setDateRange:', range);
      return;
    }

    const [start, end] = range;
    console.log('Setting new date range:', {
      start: start.format('YYYY-MM-DD HH:mm:ss'),
      end: end.format('YYYY-MM-DD HH:mm:ss')
    });

    set({ dateRange: [start, end] });
  },

  setSelectedMachine: (machine) => {
    const { allGanttData } = get();
    // Filter the displayed data on the client side (like BEL)
    const newGanttData = machine === 'all'
      ? allGanttData
      : allGanttData.filter(item => item.machine === machine);

    set({ 
      selectedMachine: machine,
      ganttData: newGanttData
    });
  },

  fetchAllData: async () => {
    set({ isLoading: true, error: null });

    try {
      const url = `${config.API_BASE_URL}/production-analytics/combined-schedule-production/`;
      console.log('Fetching ALL data from URL:', url);

      const response = await axios.get(url);
      console.log('Raw API response (all data):', response.data);

      // Ensure we have arrays even if the API returns null/undefined
      const { planned_operations = [], actual_production_logs = [], all_machines = [] } = response.data || {};

      // Log raw data
      console.log('Raw data counts (all data):', {
        planned_operations: planned_operations?.length || 0,
        actual_production_logs: actual_production_logs?.length || 0
      });

      // Transform planned operations
      const plannedItems = (planned_operations || [])
        .filter(op => {
          const hasRequiredFields = op.planned_start_time && op.planned_end_time && op.machine_name;
          const isValidDates = dayjs(op.planned_start_time).isValid() && dayjs(op.planned_end_time).isValid();
          if (!hasRequiredFields || !isValidDates) {
            console.log('Filtered out planned operation:', op);
          }
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
          if (!hasRequiredFields || !isValidDates) {
            console.log('Filtered out production log:', log);
          }
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
      
      const combinedData = [...plannedItems, ...productionItems];

      // Filter out "Default" machines from the entire dataset, checking if the name includes "default"
      const allDataFiltered = combinedData.filter(item => 
        item.machine && !item.machine.toLowerCase().includes('default')
      );

      // Get unique machine names from the filtered data (like BEL)
      const uniqueMachines = [...new Set(allDataFiltered.map(item => item.machine))].sort();
      
      console.log('Final data analysis (all data):', {
        totalItems: allDataFiltered.length,
        uniqueMachines: uniqueMachines,
        dateRange: findDateRange(allDataFiltered)
      });

      set({ 
        allGanttData: allDataFiltered, // Store all valid data
        ganttData: allDataFiltered, // Initially display all valid data
        machines: uniqueMachines, // Set the dynamic machine list (only machines with data)
        selectedMachine: 'all', // Reset selection to 'all'
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
