import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { router } from '@/router';

export function App() {
  return (
    <Provider store={store}>
      {/* No `future` prop: v7_startTransition was a v6 opt-in for behaviour
          that is simply how react-router 7 works, and the prop no longer
          exists. Dropping it changes nothing at runtime. */}
      <RouterProvider router={router} />
    </Provider>
  );
}
