import { UseFormRegister } from "react-hook-form";

type RecoveryContact = {
  phone: string;
  name: string;
};

type RecoveryFormData = {
  contacts: RecoveryContact[];
};

interface RecoveryContactInputProps {
  index: number;
  register: UseFormRegister<RecoveryFormData>;
  canRemove: boolean;
  onRemove: () => void;
}

export function RecoveryContactInput({ index, register, canRemove, onRemove }: RecoveryContactInputProps) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-1 space-y-2">
        <input
          type="tel"
          placeholder="Phone number (e.g., +1234567890)"
          className="w-full px-4 py-2 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          {...register(`contacts.${index}.phone`)}
        />
        <input
          type="text"
          placeholder="Name (optional)"
          className="w-full px-4 py-2 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          {...register(`contacts.${index}.name`)}
        />
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-danger hover:text-danger p-2"
        >
          Remove
        </button>
      )}
    </div>
  );
}
