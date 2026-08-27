import { Input } from "@mariozechner/pi-tui";

const MASK_CHARACTER = "•";

export class MaskedInput extends Input {
  override render(width: number): string[] {
    const secret = this.getValue();
    this.setValue(MASK_CHARACTER.repeat(secret.length));
    try {
      return super.render(width);
    } finally {
      this.setValue(secret);
    }
  }
}
