import { Construct } from "@aws-cdk/core";
import { Table, AttributeType } from "@aws-cdk/aws-dynamodb";

export class OrderStorage extends Construct {
    public readonly table: Table;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.table = new Table(this, "online-sales-orders-table", {
            partitionKey: {
                name: "messageId",
                type: AttributeType.STRING
            }
        });
    }
}
