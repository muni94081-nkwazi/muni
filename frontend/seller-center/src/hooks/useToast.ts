import { useDispatch } from 'react-redux';
import { showToast, hideToast } from '../store/slices/uiSlice';

export const useToast = () => {
  const dispatch = useDispatch();

  return {
    showSuccess: (message: string) => dispatch(showToast({ message, type: 'success' })),
    showError: (message: string) => dispatch(showToast({ message, type: 'error' })),
    showInfo: (message: string) => dispatch(showToast({ message, type: 'info' })),
    hideToast: (id: string) => dispatch(hideToast(id)),
  };
};
