type AddressOption = {
    address_name: string;
    ui_label: string;
    owner: string;
    check_sn?: boolean;
};

type ItemOption = {
    id: string;
    item_description: string;
    type: string;
    merek: string;
};

export function getNteTagOptions(
    addresses: AddressOption[] | undefined,
    items: ItemOption[] | undefined
) {
    const seenDescriptions = new Set<string>();
    const uniqueItems = (items ?? []).filter((item) => {
        if (seenDescriptions.has(item.item_description)) return false;
        seenDescriptions.add(item.item_description);
        return true;
    });

    return {
        addressOptions: addresses ?? [],
        itemOptions: uniqueItems,
    };
}
