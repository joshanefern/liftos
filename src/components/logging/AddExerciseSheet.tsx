import { useState, type RefObject } from "react";
import { Plus } from "lucide-react";
import { CTAButton } from "@/components/GoldButton";
import ExerciseNameSuggestions from "@/components/ExerciseNameSuggestions";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A name was entered and Add tapped (or Enter): the logger adds the
      exercise, points the focus card at it and closes the sheet. */
  onAdd: (name: string) => void;
  /** The name field. The logger puts the cursor in it once the sheet is
      up — from the tap that opened it, so iOS brings the keyboard. */
  inputRef: RefObject<HTMLInputElement>;
};

/**
 * The live workout's one way to add an exercise by hand, opened from the
 * floating bar's "+ Exercise": a name, the lifter's own exercise names as
 * suggestions, and "Add exercise".
 *
 * Its height never changes while it is open. With the keyboard up, vaul
 * holds the sheet just above it at a fixed height, so anything that grew
 * (a second row of suggestions) would push the button under the keyboard.
 * The suggestions therefore get one line of their own, scrolling sideways,
 * whether or not there is anything to suggest yet.
 */
export const AddExerciseSheet = ({ open, onOpenChange, onAdd, inputRef }: Props) => {
  const [name, setName] = useState("");
  // Every opening starts empty. Adjusted during render, so a name typed
  // last time never flashes back.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setName("");
  }
  const trimmed = name.trim();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-5 pb-[calc(var(--safe-bottom)+1.25rem)]">
        <DrawerTitle className="mt-3 pr-12 text-[17px] font-semibold leading-6 tracking-tight text-fg">
          Add exercise
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          Name an exercise to add to this workout.
        </DrawerDescription>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onAdd(trimmed);
          }}
        >
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Exercise name, e.g. Plank"
            aria-label="Exercise name"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            className="h-12 w-full rounded-[12px] border border-border bg-card px-4 text-[16px] font-medium text-fg outline-none transition placeholder:font-normal placeholder:text-fg-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
          <div className="h-11">
            <ExerciseNameSuggestions query={name} onPick={setName} singleRow />
          </div>
          <CTAButton type="submit" variant="accent" fullWidth disabled={!trimmed} className="mt-3">
            <Plus size={16} strokeWidth={2.5} />
            Add exercise
          </CTAButton>
        </form>
      </DrawerContent>
    </Drawer>
  );
};
