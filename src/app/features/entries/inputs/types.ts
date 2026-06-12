import type { Control, FieldValues } from "react-hook-form";

import type { FieldDTO } from "@/shared/api-types";

/** Props every entry field input receives: the RHF control + the field definition. */
export interface EntryFieldInputProps {
  control: Control<FieldValues>;
  field: FieldDTO;
}
