/**
 * Real E2E tests — launches the actual Tauri app via tauri-driver + msedgedriver.
 * No mocks: all IPC calls go to the real Rust backend.
 */

/** Scroll element into center of viewport so screenshots capture it */
async function scrollTo(el) {
  await el.scrollIntoView({ block: "center" });
  await browser.pause(100);
}

describe("App loads correctly", () => {
  it("shows the app title", async () => {
    const title = await $("h1");
    await expect(title).toHaveText("KeySound");
  });

  it("shows the subtitle", async () => {
    const subtitle = await $(".subtitle");
    await expect(subtitle).toHaveText("Keyboard Sound Effects");
  });

  it("shows the Minimize to Tray button", async () => {
    const trayBtn = await $(".tray-btn");
    await expect(trayBtn).toBeDisplayed();
    await expect(trayBtn).toHaveText("Minimize to Tray");
  });

  it("shows the test input field", async () => {
    const input = await $(".test-input");
    await scrollTo(input);
    await expect(input).toBeDisplayed();
  });

  it("shows the Go to Top button", async () => {
    const goTop = await $(".go-top");
    await expect(goTop).toBeDisplayed();
    await expect(goTop).toHaveText("Top");
  });
});

describe("Sound controls", () => {
  it("shows the toggle button as ON by default", async () => {
    const toggle = await $(".toggle-btn");
    await scrollTo(toggle);
    await expect(toggle).toHaveText("ON");
  });

  it("toggle button has active class when ON", async () => {
    const toggle = await $(".toggle-btn");
    await scrollTo(toggle);
    const className = await toggle.getAttribute("class");
    expect(className).toContain("active");
  });

  it("can toggle sound off and on", async () => {
    const toggle = await $(".toggle-btn");
    await toggle.click();
    await expect(toggle).toHaveText("OFF");

    // Active class should be removed when OFF
    const offClass = await toggle.getAttribute("class");
    expect(offClass).not.toContain("active");

    await toggle.click();
    await expect(toggle).toHaveText("ON");
  });

  it("shows volume percentage", async () => {
    const volumeValue = await $(".volume-value");
    await scrollTo(volumeValue);
    const text = await volumeValue.getText();
    expect(text).toMatch(/^\d+%$/);
  });

  it("has a volume slider", async () => {
    const slider = await $(".volume-slider");
    await scrollTo(slider);
    await expect(slider).toBeDisplayed();
  });

  it("volume slider has correct range attributes", async () => {
    const slider = await $(".volume-slider");
    await scrollTo(slider);
    const min = await slider.getAttribute("min");
    const max = await slider.getAttribute("max");
    const step = await slider.getAttribute("step");
    expect(min).toBe("0");
    expect(max).toBe("1");
    expect(step).toBe("0.01");
  });
});

describe("Test input", () => {
  it("can type in the test input field", async () => {
    const input = await $(".test-input");
    await input.setValue("hello");
    const value = await input.getValue();
    expect(value).toBe("hello");
    await input.clearValue();
  });

  it("has the correct placeholder text", async () => {
    const input = await $(".test-input");
    await scrollTo(input);
    const placeholder = await input.getAttribute("placeholder");
    expect(placeholder).toBe("Type here to test sounds...");
  });
});

describe("Tab navigation", () => {
  it("has two tabs", async () => {
    const tabs = await $$(".tab-btn");
    await scrollTo(tabs[0]);
    expect(tabs.length).toBe(2);
  });

  it("Sound Packs is the default active tab", async () => {
    const packsTab = await $(".tab-btn*=Sound Packs");
    await scrollTo(packsTab);
    const className = await packsTab.getAttribute("class");
    expect(className).toContain("active");
  });

  it("can switch to Custom Sound tab", async () => {
    const customTab = await $(".tab-btn*=Custom Sound");
    await customTab.click();
    const className = await customTab.getAttribute("class");
    expect(className).toContain("active");

    const packsTab = await $(".tab-btn*=Sound Packs");
    const packsClass = await packsTab.getAttribute("class");
    expect(packsClass).not.toContain("active");
  });

  it("can switch back to Sound Packs tab", async () => {
    const packsTab = await $(".tab-btn*=Sound Packs");
    await packsTab.click();
    const className = await packsTab.getAttribute("class");
    expect(className).toContain("active");
  });

  it("shows pack list when Sound Packs tab is active", async () => {
    const packList = await $(".pack-list");
    await scrollTo(packList);
    await expect(packList).toBeDisplayed();
  });

  it("hides pack list when Custom Sound tab is active", async () => {
    const customTab = await $(".tab-btn*=Custom Sound");
    await customTab.click();

    const packsSection = await $(".packs-section");
    await expect(packsSection).not.toBeDisplayed();

    const packsTab = await $(".tab-btn*=Sound Packs");
    await packsTab.click();
  });
});

describe("Sound Packs tab", () => {
  it("shows sound packs with default pack first", async () => {
    const cards = await $$(".pack-card");
    expect(cards.length).toBeGreaterThanOrEqual(1);

    const firstName = await cards[0].$(".pack-name");
    await scrollTo(cards[0]);
    const text = await firstName.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows multiple bundled packs", async () => {
    const cards = await $$(".pack-card");
    // Scroll to one of the lower packs to show they exist
    if (cards.length > 5) {
      await scrollTo(cards[5]);
    }
    expect(cards.length).toBeGreaterThanOrEqual(10);
  });

  it("default pack is selected by default", async () => {
    const firstCard = await $(".pack-card");
    await scrollTo(firstCard);
    const className = await firstCard.getAttribute("class");
    expect(className).toContain("selected");
  });

  it("pack cards show author info", async () => {
    const firstAuthor = await $(".pack-card .pack-author");
    await scrollTo(firstAuthor);
    const text = await firstAuthor.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("can select a different pack", async () => {
    const cards = await $$(".pack-card");
    if (cards.length < 2) {
      console.log("Only one pack available, skipping selection test");
      return;
    }

    const secondCard = cards[1];
    await secondCard.click();
    await browser.waitUntil(
      async () => {
        const cls = await secondCard.getAttribute("class");
        return cls.includes("selected");
      },
      { timeout: 5000, timeoutMsg: "Pack was not selected after click" },
    );

    // First card should no longer be selected
    const firstClass = await cards[0].getAttribute("class");
    expect(firstClass).not.toContain("selected");

    // Re-select default to restore state
    await cards[0].click();
    await browser.waitUntil(
      async () => {
        const cls = await cards[0].getAttribute("class");
        return cls.includes("selected");
      },
      { timeout: 5000 },
    );
  });

  it("can scroll to see packs further down the list", async () => {
    const cards = await $$(".pack-card");
    // Scroll to last card to prove all packs are accessible
    const lastCard = cards[cards.length - 1];
    await scrollTo(lastCard);
    const name = await lastCard.$(".pack-name");
    const text = await name.getText();
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("Custom Sound tab - form", () => {
  before(async () => {
    const customTab = await $(".tab-btn*=Custom Sound");
    await customTab.click();
  });

  it("shows the create form", async () => {
    const heading = await $(".new-pack-form h3");
    await scrollTo(heading);
    await expect(heading).toHaveText("Create New Custom Sound");
  });

  it("shows 5 slot rows in create form", async () => {
    const slotRows = await $$(".new-pack-form .slot-row");
    // Scroll to the last slot row so all are visible in screenshot context
    await scrollTo(slotRows[slotRows.length - 1]);
    expect(slotRows.length).toBe(5);
  });

  it("shows correct slot labels", async () => {
    const labels = await $$(".new-pack-form .slot-label");
    const texts = [];
    for (const l of labels) {
      texts.push(await l.getText());
    }
    await scrollTo(labels[0]);
    expect(texts[0]).toContain("Default Key");
    expect(texts[1]).toContain("Space");
    expect(texts[2]).toContain("Enter");
    expect(texts[3]).toContain("Modifiers");
    expect(texts[4]).toContain("Backspace / Delete");
  });

  it("Default Key slot has required marker", async () => {
    const required = await $(".new-pack-form .required");
    await scrollTo(required);
    await expect(required).toBeDisplayed();
    await expect(required).toHaveText("*");
  });

  it("all slots show None initially", async () => {
    const slotFiles = await $$(".new-pack-form .slot-file");
    for (const file of slotFiles) {
      const text = await file.getText();
      expect(text).toBe("None");
    }
    await scrollTo(slotFiles[slotFiles.length - 1]);
  });

  it("each slot has a Choose File button", async () => {
    const chooseButtons = await $$(".new-pack-form .choose-btn");
    expect(chooseButtons.length).toBe(5);
    for (const btn of chooseButtons) {
      await expect(btn).toHaveText("Choose File");
    }
    await scrollTo(chooseButtons[chooseButtons.length - 1]);
  });

  it("Create button is disabled when form is empty", async () => {
    const createBtn = await $(".create-btn");
    await scrollTo(createBtn);
    await expect(createBtn).toBeDisabled();
  });

  it("shows name input field", async () => {
    const nameInput = await $(".name-input");
    await scrollTo(nameInput);
    await expect(nameInput).toBeDisplayed();
  });

  it("Create button text says Create & Use", async () => {
    const createBtn = await $(".create-btn");
    await scrollTo(createBtn);
    await expect(createBtn).toHaveText("Create & Use");
  });

  it("Create button stays disabled with name but no default slot", async () => {
    const nameInput = await $(".name-input");
    await nameInput.setValue("Test Pack");
    const createBtn = await $(".create-btn");
    await scrollTo(createBtn);
    await expect(createBtn).toBeDisabled();
    await nameInput.clearValue();
  });

  it("shows slot hint text", async () => {
    const hint = await $(".new-pack-form .slot-hint");
    await scrollTo(hint);
    const text = await hint.getText();
    expect(text).toContain("Default Key is required");
  });

  after(async () => {
    const packsTab = await $(".tab-btn*=Sound Packs");
    await packsTab.click();
  });
});

describe("Custom Sound - create, edit, delete lifecycle", () => {
  // This test creates a real custom pack using the Tauri IPC directly
  // (bypassing the file picker dialog which can't be automated via WebDriver)

  it("can create a custom pack via IPC", async () => {
    const result = await browser.executeAsync(async (done) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("create_custom_pack", {
          name: "E2E Test Pack",
        });
        done(r);
      } catch (e) {
        done({ error: String(e) });
      }
    });
    expect(result.error).toBeUndefined();
    expect(result.id).toBeTruthy();
    expect(result.name).toBe("E2E Test Pack");
    expect(result.source).toBe("user");
  });

  it("custom pack appears in Sound Packs tab with Custom badge", async () => {
    // Reload the page to pick up the new pack created via IPC
    await browser.url(await browser.getUrl());
    await browser.waitUntil(
      async () => {
        const title = await $("h1");
        return await title.isDisplayed();
      },
      { timeout: 10000, timeoutMsg: "App did not reload" },
    );

    // Wait for pack list to render with custom badge
    await browser.waitUntil(
      async () => {
        const badges = await $$(".custom-badge");
        return badges.length > 0;
      },
      { timeout: 5000, timeoutMsg: "Custom badge not found" },
    );

    // Find our pack card
    const cards = await $$(".pack-card");
    let found = false;
    for (const card of cards) {
      const name = await card.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        await scrollTo(card);
        found = true;
        // Verify Custom badge
        const badge = await card.$(".custom-badge");
        await expect(badge).toBeDisplayed();
        await expect(badge).toHaveText("CUSTOM");
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("can select the custom pack", async () => {
    const cards = await $$(".pack-card");
    let customCard = null;
    for (const card of cards) {
      const name = await card.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        customCard = card;
        break;
      }
    }
    expect(customCard).not.toBeNull();

    await customCard.click();
    await browser.waitUntil(
      async () => {
        const cls = await customCard.getAttribute("class");
        return cls.includes("selected");
      },
      { timeout: 5000, timeoutMsg: "Custom pack was not selected" },
    );
    await scrollTo(customCard);
  });

  it("custom pack appears in Custom Sound tab with Edit and Del buttons", async () => {
    const customTab = await $(".tab-btn*=Custom Sound");
    await customTab.click();

    // Wait for existing custom packs section to appear
    await browser.waitUntil(
      async () => {
        const title = await $(".section-title");
        return await title.isDisplayed();
      },
      { timeout: 5000, timeoutMsg: "Your Custom Sounds section not found" },
    );

    const sectionTitle = await $(".section-title");
    await expect(sectionTitle).toHaveText("Your Custom Sounds");

    // Find the pack wrapper with our pack
    const wrappers = await $$(".pack-wrapper");
    let found = false;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        await scrollTo(wrapper);
        found = true;

        // Check Edit button
        const editBtn = await wrapper.$(".edit-btn");
        await expect(editBtn).toBeDisplayed();
        await expect(editBtn).toHaveText("Edit");

        // Check Del button
        const delBtn = await wrapper.$(".delete-btn");
        await expect(delBtn).toBeDisplayed();
        await expect(delBtn).toHaveText("Del");
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("clicking Edit shows slot editor with 5 slots", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    const editBtn = await targetWrapper.$(".edit-btn");
    await editBtn.click();

    // Wait for slot editor to appear
    await browser.waitUntil(
      async () => {
        const editor = await targetWrapper.$(".slot-editor");
        return await editor.isDisplayed();
      },
      { timeout: 5000, timeoutMsg: "Slot editor did not appear" },
    );

    // Should show 5 slot rows
    const slotRows = await targetWrapper.$$(".slot-editor .slot-row");
    expect(slotRows.length).toBe(5);

    // Scroll to see the editor
    const editor = await targetWrapper.$(".slot-editor");
    await scrollTo(editor);

    // Edit button should now say "Save"
    await expect(editBtn).toHaveText("Save");
  });

  it("slot editor shows correct slot labels", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    const labels = await targetWrapper.$$(".slot-editor .slot-label");
    const texts = [];
    for (const l of labels) {
      texts.push(await l.getText());
    }
    expect(texts).toEqual(["Default Key", "Space", "Enter", "Modifiers", "Backspace / Delete"]);
    await scrollTo(labels[labels.length - 1]);
  });

  it("slot editor shows Choose File buttons for each slot", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    const chooseButtons = await targetWrapper.$$(".slot-editor .choose-btn");
    expect(chooseButtons.length).toBe(5);
    await scrollTo(chooseButtons[chooseButtons.length - 1]);
  });

  it("clicking Save closes the slot editor", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    const editBtn = await targetWrapper.$(".edit-btn");
    await expect(editBtn).toHaveText("Save");
    await editBtn.click();

    // Editor should disappear
    await browser.waitUntil(
      async () => {
        const editor = await targetWrapper.$(".slot-editor");
        return !(await editor.isDisplayed());
      },
      { timeout: 5000, timeoutMsg: "Slot editor did not close" },
    );

    await expect(editBtn).toHaveText("Edit");
    await scrollTo(targetWrapper);
  });

  it("clicking Del shows delete confirmation", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    const delBtn = await targetWrapper.$(".delete-btn");
    await delBtn.click();

    // Delete confirmation should appear
    const confirm = await targetWrapper.$(".delete-confirm");
    await browser.waitUntil(async () => await confirm.isDisplayed(), {
      timeout: 5000,
      timeoutMsg: "Delete confirmation did not appear",
    });
    await scrollTo(confirm);

    // Should show pack name in confirmation
    const confirmText = await confirm.getText();
    expect(confirmText).toContain("E2E Test Pack");

    // Should have Yes and No buttons
    const yesBtn = await confirm.$(".delete-yes");
    await expect(yesBtn).toHaveText("Yes");
  });

  it("clicking No cancels deletion", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    const confirm = await targetWrapper.$(".delete-confirm");
    const noBtn = await confirm.$(".action-btn:not(.delete-yes)");
    await noBtn.click();

    // Confirmation should disappear
    await browser.waitUntil(async () => !(await confirm.isDisplayed()), {
      timeout: 5000,
      timeoutMsg: "Delete confirmation did not close",
    });

    // Pack should still exist
    const name = await targetWrapper.$(".pack-name");
    const text = await name.getText();
    expect(text).toContain("E2E Test Pack");
    await scrollTo(targetWrapper);
  });

  it("clicking Yes deletes the pack", async () => {
    const wrappers = await $$(".pack-wrapper");
    let targetWrapper = null;
    for (const wrapper of wrappers) {
      const name = await wrapper.$(".pack-name");
      const text = await name.getText();
      if (text.includes("E2E Test Pack")) {
        targetWrapper = wrapper;
        break;
      }
    }

    // Click Del again
    const delBtn = await targetWrapper.$(".delete-btn");
    await delBtn.click();

    const confirm = await targetWrapper.$(".delete-confirm");
    await browser.waitUntil(async () => await confirm.isDisplayed(), { timeout: 5000 });

    // Click Yes to confirm deletion
    const yesBtn = await confirm.$(".delete-yes");
    await yesBtn.click();

    // Wait for pack to disappear from the list
    await browser.waitUntil(
      async () => {
        const remainingWrappers = await $$(".pack-wrapper");
        for (const w of remainingWrappers) {
          const n = await w.$(".pack-name");
          const t = await n.getText();
          if (t.includes("E2E Test Pack")) return false;
        }
        return true;
      },
      { timeout: 5000, timeoutMsg: "Pack was not deleted" },
    );

    // Scroll to custom tab area for screenshot
    const customTab = await $(".tab-btn*=Custom Sound");
    await scrollTo(customTab);
  });

  it("after deletion, default pack is re-selected", async () => {
    // Switch to Sound Packs tab to verify
    const packsTab = await $(".tab-btn*=Sound Packs");
    await packsTab.click();

    const firstCard = await $(".pack-card");
    await scrollTo(firstCard);
    const className = await firstCard.getAttribute("class");
    expect(className).toContain("selected");
  });
});

describe("Custom Sound - form validation", () => {
  before(async () => {
    const customTab = await $(".tab-btn*=Custom Sound");
    await customTab.click();
  });

  it("Create button disabled with empty name", async () => {
    const nameInput = await $(".name-input");
    await nameInput.clearValue();
    const createBtn = await $(".create-btn");
    await scrollTo(createBtn);
    await expect(createBtn).toBeDisabled();
  });

  it("Create button disabled with only whitespace name", async () => {
    const nameInput = await $(".name-input");
    await nameInput.setValue("   ");
    const createBtn = await $(".create-btn");
    await scrollTo(createBtn);
    await expect(createBtn).toBeDisabled();
    await nameInput.clearValue();
  });

  it("Create button disabled with name but no default slot file", async () => {
    const nameInput = await $(".name-input");
    await nameInput.setValue("Valid Name");
    const createBtn = await $(".create-btn");
    await scrollTo(createBtn);
    await expect(createBtn).toBeDisabled();
    await nameInput.clearValue();
  });

  it("name input has correct placeholder", async () => {
    const nameInput = await $(".name-input");
    await scrollTo(nameInput);
    const placeholder = await nameInput.getAttribute("placeholder");
    expect(placeholder).toBe("Sound pack name...");
  });

  after(async () => {
    const packsTab = await $(".tab-btn*=Sound Packs");
    await packsTab.click();
  });
});

describe("Custom Sound - IPC backend commands", () => {
  // Tests that verify Tauri IPC commands for custom pack CRUD
  // using the real backend (bypasses file picker which can't be automated)

  let packId = null;

  it("can create a pack and read its slots via IPC", async () => {
    const pack = await browser.executeAsync(async (done) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("create_custom_pack", {
          name: "IPC Test Pack",
        });
        done(r);
      } catch (e) {
        done({ error: String(e) });
      }
    });
    expect(pack.error).toBeUndefined();
    packId = pack.id;
    expect(pack.name).toBe("IPC Test Pack");

    // Get the pack slots — default should exist
    const slots = await browser.executeAsync(async (id, done) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("get_custom_pack_slots", { packId: id });
        done(r);
      } catch (e) {
        done({ error: String(e) });
      }
    }, packId);
    expect(slots.error).toBeUndefined();
    expect(slots.length).toBe(5);
    expect(slots[0].slot).toBe("default");
    expect(slots[0].label).toBe("Default Key");
  });

  it("pack shows up in the pack list via IPC", async () => {
    const packs = await browser.executeAsync(async (done) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("get_sound_packs");
        done(r);
      } catch (e) {
        done({ error: String(e) });
      }
    });
    expect(packs.error).toBeUndefined();
    const found = packs.find((p) => p.id === packId);
    expect(found).toBeTruthy();
    expect(found.source).toBe("user");
  });

  it("can rename the custom pack via IPC", async () => {
    const result = await browser.executeAsync(async (id, done) => {
      try {
        await window.__TAURI_INTERNALS__.invoke("rename_custom_pack", {
          packId: id,
          newName: "Renamed Pack",
        });
        done({ ok: true });
      } catch (e) {
        done({ error: String(e) });
      }
    }, packId);
    expect(result.error).toBeUndefined();

    // Verify rename
    const packs = await browser.executeAsync(async (done) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("get_sound_packs");
        done(r);
      } catch (e) {
        done({ error: String(e) });
      }
    });
    const found = packs.find((p) => p.id === packId);
    expect(found.name).toBe("Renamed Pack");
  });

  it("can delete the custom pack via IPC", async () => {
    const result = await browser.executeAsync(async (id, done) => {
      try {
        await window.__TAURI_INTERNALS__.invoke("delete_custom_pack", { packId: id });
        done({ ok: true });
      } catch (e) {
        done({ error: String(e) });
      }
    }, packId);
    expect(result.error).toBeUndefined();

    // Verify deletion
    const packs = await browser.executeAsync(async (done) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("get_sound_packs");
        done(r);
      } catch (e) {
        done({ error: String(e) });
      }
    });
    const found = packs.find((p) => p.id === packId);
    expect(found).toBeUndefined();
  });

  after(async () => {
    const packsTab = await $(".tab-btn*=Sound Packs");
    await packsTab.click();
  });
});

describe("Footer", () => {
  it("shows the tray hint", async () => {
    const hint = await $(".hint");
    await scrollTo(hint);
    await expect(hint).toHaveText('Use "Minimize to Tray" to keep running in background');
  });

  it("shows the credits link", async () => {
    const credits = await $(".credits a");
    await scrollTo(credits);
    await expect(credits).toBeDisplayed();
  });

  it("credits link points to correct URL", async () => {
    const link = await $(".credits a");
    await scrollTo(link);
    const href = await link.getAttribute("href");
    expect(href).toBe("https://soundeffect-lab.info/");
  });
});
