import { BracketsCurlyIcon } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { fieldError } from "./fields";

type DialogField = "startCtx" | "payload";

const OPENER_LABEL = {
  startCtx: "edit start ctx",
  payload: "edit payload",
} as const satisfies Record<DialogField, string>;

interface EditorProps {
  readonly field: DialogField;
  readonly title: string;
  readonly confirmLabel: string;
  /** The bar field's text, which the editor opens on. */
  readonly read: () => string;
  readonly onConfirm: (text: string) => void;
}

/** The draft of one open dialog; it mounts with the dialog, so a reopened dialog starts over. */
function Editor({
  field,
  title,
  confirmLabel,
  read,
  onConfirm,
  close,
}: EditorProps & { readonly close: () => void }) {
  const editorId = useId();
  const errorId = useId();
  const [defaultValues] = useState(() => ({ text: read() }));
  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      onConfirm(value.text);
      close();
    },
  });
  const validate = ({ value }: { value: string }) => fieldError(field, value);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>A TypeScript object literal or JSON.</DialogDescription>
      </DialogHeader>
      <form.Field name="text" validators={{ onMount: validate, onChange: validate }}>
        {(text) => (
          <Field>
            <FieldLabel htmlFor={editorId} className="sr-only">
              {title}
            </FieldLabel>
            <Textarea
              id={editorId}
              rows={12}
              spellCheck={false}
              className="field-sizing-fixed font-mono"
              value={text.state.value}
              aria-invalid={!text.state.meta.isValid}
              aria-describedby={text.state.meta.isValid ? undefined : errorId}
              onChange={(event) => text.handleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void form.handleSubmit();
                }
              }}
            />
            <FieldError
              id={errorId}
              errors={text.state.meta.errors.map((message) => ({ message }))}
            />
          </Field>
        )}
      </form.Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={!canSubmit}>
              {confirmLabel}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

/** A button that opens one bar field's text in a dialog with a multi-line editor. */
export function JsonDialog({
  disabled = false,
  ...editor
}: EditorProps & { readonly disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          aria-label={OPENER_LABEL[editor.field]}
        >
          <BracketsCurlyIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="font-mono">
        <Editor {...editor} close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
