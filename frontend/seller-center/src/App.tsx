import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import { router } from './router';

function App() {
  return (
    <Provider store={store}>
      {/* v7_startTransition was a v6 opt-in for behaviour that is now the
          default; the prop no longer exists in react-router 7. */}
      <RouterProvider router={router} />
    </Provider>
  );
}

export default App;
