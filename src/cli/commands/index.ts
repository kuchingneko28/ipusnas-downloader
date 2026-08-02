import type { CAC } from "cac";
import { register as registerLogin } from "./login";
import { register as registerRegister } from "./register";
import { register as registerShelf } from "./shelf";
import { register as registerSearch } from "./search";
import { register as registerBorrow } from "./borrow";
import { register as registerDownload } from "./download";
import { register as registerReturn } from "./return";
import { register as registerDoctor } from "./doctor";

export function registerCommands(cli: CAC): void {
  registerLogin(cli);
  registerRegister(cli);
  registerShelf(cli);
  registerSearch(cli);
  registerBorrow(cli);
  registerDownload(cli);
  registerReturn(cli);
  registerDoctor(cli);
}
