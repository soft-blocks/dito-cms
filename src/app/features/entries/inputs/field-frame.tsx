import type { ControllerRenderProps, FieldValues } from "react-hook-form";

import type { EntryFieldInputProps } from "./types";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { FIELD_TYPES } from "@/shared/field-types";
import type { FieldDTO } from "@/shared/api-types";

/** Whether a field is required (boolean has no required flag). */
export function isFieldRequired(field: FieldDTO): boolean {
  return FIELD_TYPES[field.type].hasRequired && field.options.required === true;
}

export function RequiredMark({ field }: { field: FieldDTO }): React.ReactElement | null {
  return isFieldRequired(field) ? (
    <span className="text-destructive" aria-hidden>
      {" *"}
    </span>
  ) : null;
}

/**
 * Standard label / control / help / error frame for single-control field inputs.
 * The render-prop receives the RHF field bag so the input can bind to it.
 */
export function FieldFrame({
  control,
  field,
  children,
}: EntryFieldInputProps & {
  children: (rhf: ControllerRenderProps<FieldValues, string>) => React.ReactNode;
}): React.ReactElement {
  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem>
          <FormLabel>
            {field.label}
            <RequiredMark field={field} />
          </FormLabel>
          <FormControl>{children(rhf)}</FormControl>
          {field.options.help ? <FormDescription>{field.options.help}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
