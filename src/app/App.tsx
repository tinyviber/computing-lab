import { RouterProvider } from "@tanstack/react-router";
import { LabNavigationProvider } from "../shared/lab/LabNavigationProvider";
import { labs } from "./catalog/labs";
import { router } from "./router";

export default function App() {
  return (
    <LabNavigationProvider labs={labs}>
      <RouterProvider router={router} />
    </LabNavigationProvider>
  );
}
