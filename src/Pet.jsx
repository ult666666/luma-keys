import React from "react";
import MaestroAvatar from "./MaestroAvatar.jsx";
import { CompanionPet } from "./screens/StudioCompanion.jsx";

export default function Pet({ kind = "cat", happy = false, large = false }) {
  return (
    <div className={`pet ${large ? "large" : ""} ${happy ? "happy" : ""}`}>
      {["beethoven", "langlang", "mozart", "liszt"].includes(kind) ? (
        <MaestroAvatar character={kind} mood={happy ? "celebrate" : "idle"} />
      ) : (
        <CompanionPet kind={kind} happy={happy} />
      )}
    </div>
  );
}
